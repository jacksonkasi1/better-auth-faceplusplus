import type {
  FacePPDetectResponse,
  FacePPCompareResponse,
  FacePPSearchResponse,
  FacePPFaceSetResponse,
} from "./types";

export interface FacePPClientConfig {
  apiKey: string;
  apiSecret: string;
  baseUrl: string;
}

/**
 * HTTP client for the Face++ (Megvii) REST API.
 *
 * All endpoints use multipart/form-data.
 * Docs: https://console.faceplusplus.com/documents/6329465
 */
export class FacePPClient {
  private apiKey: string;
  private apiSecret: string;
  private baseUrl: string;

  /**
   * Queue to serialize all Face++ API calls.
   * The free tier only allows 1 concurrent request — firing multiple
   * calls in parallel results in CONCURRENCY_LIMIT_EXCEEDED (HTTP 403).
   * This queue ensures requests execute one-at-a-time.
   */
  private requestQueue: Promise<unknown> = Promise.resolve();

  constructor(config: FacePPClientConfig) {
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
    this.baseUrl = config.baseUrl.replace(/\/$/, ""); // strip trailing slash
  }

  /** Small delay helper */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Execute a Face++ API call through the serialized queue.
   * Ensures only one request is in-flight at a time, with a small
   * gap between requests to avoid concurrency limit errors.
   */
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const task = this.requestQueue
      .catch(() => {}) // don't let a previous failure block the queue
      .then(() => this.delay(100)) // small gap between requests
      .then(() => fn());
    this.requestQueue = task.catch(() => {}); // keep queue moving even on error
    return task;
  }

  /**
   * Generic request helper with retry for concurrency limits.
   * Face++ requires all params as multipart/form-data (not JSON).
   */
  private async request<T>(
    endpoint: string,
    params: Record<string, string>,
    retries: number = 2,
  ): Promise<T> {
    return this.enqueue(async () => {
      for (let attempt = 0; attempt <= retries; attempt++) {
        const form = new FormData();
        form.append("api_key", this.apiKey);
        form.append("api_secret", this.apiSecret);

        for (const [key, value] of Object.entries(params)) {
          form.append(key, value);
        }

        const response = await fetch(`${this.baseUrl}${endpoint}`, {
          method: "POST",
          body: form,
        });

        if (!response.ok) {
          const text = await response.text();

          // Retry on concurrency limit (Face++ free tier)
          if (
            response.status === 403 &&
            text.includes("CONCURRENCY_LIMIT_EXCEEDED") &&
            attempt < retries
          ) {
            await this.delay(1000 * (attempt + 1)); // 1s, 2s backoff
            continue;
          }

          throw new Error(
            `Face++ API HTTP ${response.status}: ${text}`,
          );
        }

        const data = (await response.json()) as T & { error_message?: string };

        if (data.error_message) {
          // Also retry on concurrency limit returned in JSON body
          if (
            data.error_message.includes("CONCURRENCY_LIMIT_EXCEEDED") &&
            attempt < retries
          ) {
            await this.delay(1000 * (attempt + 1));
            continue;
          }
          throw new Error(`Face++ API error: ${data.error_message}`);
        }

        return data;
      }

      // Should never reach here, but just in case
      throw new Error("Face++ API: max retries exceeded");
    });
  }

  // ─── Detection ────────────────────────────────────────────

  /**
   * Detect faces in a base64-encoded image.
   * Returns face_token(s) for each detected face.
   *
   * Endpoint: POST /facepp/v3/detect
   * Docs: https://console.faceplusplus.com/documents/5679127
   */
  async detect(imageBase64: string): Promise<FacePPDetectResponse> {
    return this.request<FacePPDetectResponse>("/facepp/v3/detect", {
      image_base64: imageBase64,
    });
  }

  // ─── Comparison ───────────────────────────────────────────

  /**
   * Compare two faces by their face_tokens.
   * Returns a confidence score (0-100).
   *
   * Endpoint: POST /facepp/v3/compare
   * Docs: https://console.faceplusplus.com/documents/5679308
   */
  async compare(
    faceToken1: string,
    faceToken2: string,
  ): Promise<FacePPCompareResponse> {
    return this.request<FacePPCompareResponse>("/facepp/v3/compare", {
      face_token1: faceToken1,
      face_token2: faceToken2,
    });
  }

  // ─── Search ───────────────────────────────────────────────

  /**
   * Search for a face in a FaceSet.
   * Returns the top matching face_tokens with confidence scores.
   *
   * Used when `requireEmail: false` — the user just scans their face
   * and we find who they are by searching the entire FaceSet.
   *
   * Endpoint: POST /facepp/v3/search
   * Docs: https://console.faceplusplus.com/documents/5681455
   */
  async search(
    outerId: string,
    faceToken: string,
  ): Promise<FacePPSearchResponse> {
    return this.request<FacePPSearchResponse>("/facepp/v3/search", {
      face_token: faceToken,
      outer_id: outerId,
      return_result_count: "1",
    });
  }

  // ─── FaceSet Management ───────────────────────────────────

  /**
   * Create a FaceSet (a group/collection for storing face_tokens).
   * Typically called once per app/environment.
   *
   * Endpoint: POST /facepp/v3/faceset/create
   * Docs: https://console.faceplusplus.com/documents/6329329
   */
  async createFaceSet(outerId: string): Promise<FacePPFaceSetResponse> {
    return this.request<FacePPFaceSetResponse>("/facepp/v3/faceset/create", {
      outer_id: outerId,
      display_name: outerId,
    });
  }

  /**
   * Add a face_token to an existing FaceSet.
   *
   * Endpoint: POST /facepp/v3/faceset/addface
   * Docs: https://console.faceplusplus.com/documents/6329371
   */
  async addToFaceSet(
    outerId: string,
    faceToken: string,
  ): Promise<FacePPFaceSetResponse> {
    return this.request<FacePPFaceSetResponse>("/facepp/v3/faceset/addface", {
      outer_id: outerId,
      face_tokens: faceToken,
    });
  }

  /**
   * Remove a face_token from a FaceSet.
   *
   * Endpoint: POST /facepp/v3/faceset/removeface
   * Docs: https://console.faceplusplus.com/documents/6329371
   */
  async removeFromFaceSet(
    outerId: string,
    faceToken: string,
  ): Promise<FacePPFaceSetResponse> {
    return this.request<FacePPFaceSetResponse>(
      "/facepp/v3/faceset/removeface",
      {
        outer_id: outerId,
        face_tokens: faceToken,
      },
    );
  }
}