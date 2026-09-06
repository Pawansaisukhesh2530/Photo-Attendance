"""Licensed-model adapter and class-scoped matching policy.

The ONNX files are deployment inputs and are never downloaded by the application.
SCRFD exports vary; output decoding follows the common InsightFace score/bbox/keypoint
layout and fails closed if a supplied model has an unsupported signature.
"""
from dataclasses import dataclass
from functools import lru_cache
import io
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps

try:
    from pillow_heif import register_heif_opener

    register_heif_opener()
except ImportError:
    pass

from .config import get_settings


class ModelUnavailable(RuntimeError):
    pass


def decode_image(content: bytes, cv2):
    """Decode JPEG/PNG through OpenCV and fall back to Pillow for HEIC phone uploads."""
    image = cv2.imdecode(np.frombuffer(content, np.uint8), cv2.IMREAD_COLOR)
    if image is not None:
        return image
    try:
        with Image.open(io.BytesIO(content)) as source:
            rgb = np.asarray(ImageOps.exif_transpose(source).convert("RGB"))
    except Exception as exc:
        raise ValueError("Image decoding failed") from exc
    return cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)


@lru_cache(maxsize=1)
def get_face_engine():
    settings=get_settings()
    if settings.recognition_backend in {"auto","scrfd_arcface"}:
        try:return OnnxFaceEngine()
        except ModelUnavailable:
            if settings.recognition_backend=="scrfd_arcface":raise
    return OpenCvFaceEngine()


@dataclass(frozen=True)
class Detection:
    box: tuple[float, float, float, float]
    landmarks: np.ndarray
    confidence: float
    embedding: np.ndarray
    quality: dict


@dataclass(frozen=True)
class MatchDecision:
    student_id: str | None
    status: str
    score: float | None
    reason: str | None
    candidates: list[tuple[str, float]]


def normalize(vector: np.ndarray) -> np.ndarray:
    value=np.asarray(vector,dtype=np.float32).reshape(-1)
    norm=float(np.linalg.norm(value))
    if not np.isfinite(norm) or norm<=1e-12:raise ValueError("Invalid zero or non-finite embedding")
    return value/norm


def decide_match(probe: np.ndarray, gallery: dict[str,list[np.ndarray]]) -> MatchDecision:
    settings=get_settings();probe=normalize(probe);scores=[]
    for student_id,templates in gallery.items():
        if not templates:continue
        # Best two references reward repeat support while remaining robust to one weak enrolment.
        similarities=sorted((float(np.dot(probe,normalize(t))) for t in templates),reverse=True)
        aggregate=similarities[0] if len(similarities)==1 else 0.7*similarities[0]+0.3*similarities[1]
        scores.append((student_id,aggregate))
    scores.sort(key=lambda x:x[1],reverse=True);top=scores[:3]
    if not top or top[0][1]<settings.match_threshold:return MatchDecision(None,"UNKNOWN",top[0][1] if top else None,"BELOW_THRESHOLD",top)
    if len(top)>1 and top[0][1]-top[1][1]<settings.ambiguity_margin:return MatchDecision(None,"REVIEW",top[0][1],"AMBIGUOUS_CANDIDATES",top)
    return MatchDecision(top[0][0],"PRESENT",top[0][1],None,top)


def nms(boxes: list[tuple[float,float,float,float,float]], threshold:float=.4):
    if not boxes:return []
    a=np.asarray(boxes,dtype=np.float32);order=np.argsort(a[:,4])[::-1];keep=[]
    while order.size:
        i=int(order[0]);keep.append(tuple(float(x) for x in a[i]));
        if order.size==1:break
        rest=order[1:];xx1=np.maximum(a[i,0],a[rest,0]);yy1=np.maximum(a[i,1],a[rest,1]);xx2=np.minimum(a[i,2],a[rest,2]);yy2=np.minimum(a[i,3],a[rest,3])
        inter=np.maximum(0,xx2-xx1)*np.maximum(0,yy2-yy1);area_i=(a[i,2]-a[i,0])*(a[i,3]-a[i,1]);area_r=(a[rest,2]-a[rest,0])*(a[rest,3]-a[rest,1]);iou=inter/(area_i+area_r-inter+1e-6)
        order=rest[iou<=threshold]
    return keep


class OnnxFaceEngine:
    def __init__(self):
        settings=get_settings()
        if not Path(settings.detector_model_path).is_file() or not Path(settings.embedder_model_path).is_file():
            raise ModelUnavailable("Licensed detector and embedder model files are not configured")
        try:
            import cv2
            import onnxruntime as ort
        except ImportError as exc:raise ModelUnavailable("Install the vision dependency group") from exc
        self.cv2=cv2
        available=ort.get_available_providers();preferred=[p for p in ("CUDAExecutionProvider","CPUExecutionProvider") if p in available]
        self.providers=preferred
        self.detector=ort.InferenceSession(settings.detector_model_path,providers=preferred)
        self.embedder=ort.InferenceSession(settings.embedder_model_path,providers=preferred)
        self.det_input=self.detector.get_inputs()[0].name;self.emb_input=self.embedder.get_inputs()[0].name

    def _decode_scrfd(self,outputs,input_size:int,score_threshold:float=.45):
        # Common SCRFD exports return 2 or 3 tensors per stride (8, 16, 32).
        count=len(outputs);groups=3 if count%3==0 else 2 if count%2==0 else 0
        if not groups:raise ModelUnavailable("Unsupported SCRFD ONNX output signature")
        levels=count//groups;strides=[8,16,32,64,128][:levels];result=[]
        for level,stride in enumerate(strides):
            scores=np.asarray(outputs[level]).reshape(-1)
            boxes=np.asarray(outputs[level+levels]).reshape(-1,4)
            kps=np.asarray(outputs[level+2*levels]).reshape(-1,10) if groups==3 else None
            height=width=input_size//stride;centers=np.stack(np.mgrid[:height,:width][::-1],axis=-1).reshape(-1,2)*stride
            anchors=max(1,len(scores)//len(centers));centers=np.repeat(centers,anchors,axis=0)[:len(scores)]
            for idx in np.where(scores>=score_threshold)[0]:
                c=centers[idx];d=boxes[idx]*stride;box=(c[0]-d[0],c[1]-d[1],c[0]+d[2],c[1]+d[3],float(scores[idx]))
                points=np.zeros((5,2),dtype=np.float32) if kps is None else (kps[idx].reshape(5,2)*stride+np.tile(c,(5,1)))
                result.append((box,points))
        return result

    def _detect_scale(self,image,input_size=1280):
        cv2=self.cv2;h,w=image.shape[:2];scale=min(input_size/w,input_size/h);resized=cv2.resize(image,(max(1,int(w*scale)),max(1,int(h*scale))))
        canvas=np.zeros((input_size,input_size,3),dtype=np.uint8);canvas[:resized.shape[0],:resized.shape[1]]=resized
        blob=cv2.dnn.blobFromImage(canvas,1/128,(input_size,input_size),(127.5,127.5,127.5),swapRB=True)
        outputs=self.detector.run(None,{self.det_input:blob});decoded=self._decode_scrfd(outputs,input_size);return [(tuple(v/scale for v in box[:4])+(box[4],),points/scale) for box,points in decoded]

    def detect(self,image):
        raw=self._detect_scale(image)
        # Overlapping tiles preserve distant faces that would become too small after a full-frame resize.
        h,w=image.shape[:2];tile=min(2200,max(900,min(h,w)));step=max(1,int(tile*.75))
        if max(h,w)>1800:
            for y in range(0,h,step):
                for x in range(0,w,step):
                    crop=image[y:min(y+tile,h),x:min(x+tile,w)]
                    if min(crop.shape[:2])<320:continue
                    for box,points in self._detect_scale(crop,960):
                        raw.append(((box[0]+x,box[1]+y,box[2]+x,box[3]+y,box[4]),points+np.array([x,y])))
        kept=nms([x[0] for x in raw]);result=[]
        for box in kept:
            source=min(raw,key=lambda x:sum(abs(x[0][i]-box[i]) for i in range(4)))
            result.append((box,source[1]))
        return result

    def embed(self,image,landmarks):
        cv2=self.cv2;target=np.array([[38.2946,51.6963],[73.5318,51.5014],[56.0252,71.7366],[41.5493,92.3655],[70.7299,92.2041]],dtype=np.float32)
        matrix,_=cv2.estimateAffinePartial2D(np.asarray(landmarks,dtype=np.float32),target,method=cv2.LMEDS)
        if matrix is None:raise ValueError("Face landmarks cannot be aligned")
        crop=cv2.warpAffine(image,matrix,(112,112));blob=cv2.dnn.blobFromImage(crop,1/127.5,(112,112),(127.5,127.5,127.5),swapRB=True)
        return normalize(self.embedder.run(None,{self.emb_input:blob})[0])

    def analyse(self,content:bytes):
        image=decode_image(content,self.cv2)
        result=[]
        for box,points in self.detect(image):
            x1,y1,x2,y2=[int(max(0,v)) for v in box[:4]];crop=image[y1:y2,x1:x2]
            gray=self.cv2.cvtColor(crop,self.cv2.COLOR_BGR2GRAY) if crop.size else np.zeros((1,1),dtype=np.uint8)
            quality={"detection_confidence":float(box[4]),"blur_variance":float(self.cv2.Laplacian(gray,self.cv2.CV_64F).var()),"mean_brightness":float(gray.mean()),"face_width":x2-x1,"face_height":y2-y1}
            result.append(Detection(tuple(box[:4]),points,float(box[4]),self.embed(image,points),quality))
        return result


class OpenCvFaceEngine:
    """Permissively licensed local-test adapter using OpenCV YuNet and SFace."""
    def __init__(self):
        settings=get_settings(); detector=Path(settings.yunet_model_path); embedder=Path(settings.sface_model_path)
        if not detector.is_file() or not embedder.is_file():
            raise ModelUnavailable("OpenCV YuNet and SFace model files are not configured")
        try:import cv2
        except ImportError as exc:raise ModelUnavailable("Install the vision dependency group") from exc
        self.cv2=cv2
        self.detector=cv2.FaceDetectorYN.create(str(detector),"",(320,320),0.65,0.3,5000)
        self.recognizer=cv2.FaceRecognizerSF.create(str(embedder),"")

    def analyse(self,content:bytes):
        cv2=self.cv2; image=decode_image(content,cv2)
        h,w=image.shape[:2]
        # YuNet becomes unreliable and memory-heavy when a full-resolution phone photo is used as
        # its network input. Detect on a bounded copy, then scale boxes and landmarks back to the
        # original image so SFace still receives the highest-quality crop.
        scale=min(1.0,2048/max(h,w)); detection_image=image
        if scale<1.0:detection_image=cv2.resize(image,(max(1,int(w*scale)),max(1,int(h*scale))))
        dh,dw=detection_image.shape[:2];self.detector.setInputSize((dw,dh));_,faces=self.detector.detect(detection_image)
        result=[]
        for face in ([] if faces is None else faces):
            face=face.copy()
            if scale<1.0:face[:14]/=scale
            x,y,bw,bh=[float(v) for v in face[:4]]; landmarks=np.asarray(face[4:14],dtype=np.float32).reshape(5,2)
            aligned=self.recognizer.alignCrop(image,face); raw=self.recognizer.feature(aligned).reshape(-1)
            # SFace produces 128 values; zero-padding preserves cosine scores in the 512-vector schema.
            vector=np.zeros(512,dtype=np.float32); vector[:min(512,len(raw))]=raw[:512]; embedding=normalize(vector)
            crop=image[max(0,int(y)):max(0,int(y+bh)),max(0,int(x)):max(0,int(x+bw))]
            gray=cv2.cvtColor(crop,cv2.COLOR_BGR2GRAY) if crop.size else np.zeros((1,1),dtype=np.uint8)
            quality={"detection_confidence":float(face[14]),"blur_variance":float(cv2.Laplacian(gray,cv2.CV_64F).var()),"mean_brightness":float(gray.mean()),"face_width":int(bw),"face_height":int(bh)}
            result.append(Detection((x,y,x+bw,y+bh),landmarks,float(face[14]),embedding,quality))
        return result
