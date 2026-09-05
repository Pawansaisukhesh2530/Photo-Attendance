"""Run detection capacity checks against a consented classroom dataset."""
import argparse
import json
import statistics
import time
from pathlib import Path

from .recognition import get_face_engine


def run(dataset: Path, manifest_path: Path) -> dict:
    manifest=json.loads(manifest_path.read_text(encoding="utf-8"));engine=get_face_engine();rows=[]
    for item in manifest["images"]:
        path=dataset/item["file"];start=time.perf_counter();detections=engine.analyse(path.read_bytes());elapsed=(time.perf_counter()-start)*1000
        expected=int(item["visible_faces"]);rows.append({"file":item["file"],"expected":expected,"detected":len(detections),"detection_recall":min(len(detections),expected)/expected if expected else 1.0,"latency_ms":round(elapsed,2)})
    latencies=[r["latency_ms"] for r in rows]
    return {"model_version":__import__("app.config",fromlist=["get_settings"]).get_settings().model_version,"images":rows,"mean_detection_recall":statistics.mean(r["detection_recall"] for r in rows) if rows else 0,"mean_latency_ms":statistics.mean(latencies) if latencies else 0,"max_latency_ms":max(latencies,default=0)}


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument("dataset",type=Path);parser.add_argument("manifest",type=Path);parser.add_argument("--output",type=Path,default=Path("benchmark-results.json"));args=parser.parse_args()
    result=run(args.dataset,args.manifest);args.output.write_text(json.dumps(result,indent=2),encoding="utf-8");print(json.dumps(result,indent=2))
