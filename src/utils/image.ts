import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { PHOTO_COMPRESSION_QUALITY, PHOTO_MAX_DIMENSION } from '@/constants/config';

export interface PreparedPhoto {
  uri: string;
  width: number;
  height: number;
}

/**
 * Prepares a captured classroom photograph for upload.
 *
 * This is the only place the app touches image bytes. It resizes and re-encodes; it does
 * not inspect, analyse or interpret the image in any way. Face detection and recognition
 * are backend concerns.
 *
 * Why it exists: a full-resolution capture from a modern phone is 4–12 MB. Sending that
 * over campus wifi is slow enough that a lecturer would notice, and holding it in memory
 * while also rendering it in the results viewer risks an OOM on low-end Android devices.
 * 2048px on the long edge keeps enough detail for face detection at classroom distance
 * while cutting the payload by roughly an order of magnitude.
 *
 * If manipulation fails the original URI is returned rather than throwing. A slightly
 * larger upload is a far better outcome than losing a photograph the lecturer cannot
 * retake, because the class has already moved on.
 */
export async function prepareClassroomPhoto(
  uri: string,
  width: number,
  height: number,
): Promise<PreparedPhoto> {
  try {
    const longEdge = Math.max(width, height);

    // Already small enough — re-encoding would only lose quality for no benefit.
    if (longEdge <= PHOTO_MAX_DIMENSION) {
      return { uri, width, height };
    }

    const scale = PHOTO_MAX_DIMENSION / longEdge;
    const targetWidth = Math.round(width * scale);
    const targetHeight = Math.round(height * scale);

    const context = ImageManipulator.manipulate(uri);
    context.resize({ width: targetWidth, height: targetHeight });

    const image = await context.renderAsync();
    const result = await image.saveAsync({
      format: SaveFormat.JPEG,
      compress: PHOTO_COMPRESSION_QUALITY,
    });

    return {
      uri: result.uri,
      width: result.width ?? targetWidth,
      height: result.height ?? targetHeight,
    };
  } catch {
    return { uri, width, height };
  }
}
