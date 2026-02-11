/**
 * Face++ (Megvii) API response types.
 * Docs: https://console.faceplusplus.com/documents/6329465
 */

/** Single face detected in an image */
export interface FacePPFace {
  face_token: string;
  face_rectangle: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
}

/** POST /facepp/v3/detect */
export interface FacePPDetectResponse {
  request_id: string;
  faces: FacePPFace[];
  face_num: number;
  image_id: string;
}

/** POST /facepp/v3/compare */
export interface FacePPCompareResponse {
  request_id: string;
  confidence: number;
  thresholds: {
    "1e-3": number;
    "1e-4": number;
    "1e-5": number;
  };
}

/** POST /facepp/v3/faceset/create and /faceset/addface, /faceset/removeface */
export interface FacePPFaceSetResponse {
  request_id: string;
  faceset_token: string;
  outer_id: string;
  face_added?: number;
  face_removed?: number;
  face_count?: number;
}

/** Single result from a FaceSet search */
export interface FacePPSearchResult {
  face_token: string;
  confidence: number;
}

/** POST /facepp/v3/search */
export interface FacePPSearchResponse {
  request_id: string;
  results: FacePPSearchResult[];
  thresholds: {
    "1e-3": number;
    "1e-4": number;
    "1e-5": number;
  };
}

/** Error shape returned by Face++ on failure */
export interface FacePPErrorResponse {
  error_message: string;
  request_id: string;
}