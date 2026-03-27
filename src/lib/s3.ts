import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3Config = {
  region: process.env.AWS_DEFAULT_REGION ?? "auto",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
  // S3_FORCE_PATH_STYLE=true required for local MinIO (uses http://host/bucket/key).
  // Must be false (unset) for Railway Buckets/Tigris which uses virtual-hosted style (http://bucket.host/key).
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
};

// Client for server-side operations (upload, delete, list) — uses Docker-internal endpoint in dev.
const s3 = new S3Client({ ...s3Config, endpoint: process.env.AWS_ENDPOINT_URL! });

// Client for presigned URL generation — uses the browser-accessible endpoint so the signed
// host matches what the browser will request. S3_PUBLIC_ENDPOINT_URL overrides the endpoint
// in local dev (e.g. http://192.168.6.249:9000 instead of http://minio:9000).
// In Railway, S3_PUBLIC_ENDPOINT_URL is not set so this falls back to AWS_ENDPOINT_URL.
const s3Public = new S3Client({
  ...s3Config,
  endpoint: process.env.S3_PUBLIC_ENDPOINT_URL ?? process.env.AWS_ENDPOINT_URL!,
});

const BUCKET = process.env.AWS_S3_BUCKET_NAME ?? "wedding-planner-uploads";

export async function uploadFile(key: string, body: Buffer, contentType: string): Promise<void> {
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
  }));
}

export async function getDownloadUrl(key: string, expiresInSeconds = 3600): Promise<string> {
  // Uses s3Public so the presigned URL is signed with the browser-accessible endpoint.
  // Signature and host must match — signing with the internal endpoint then rewriting the
  // URL breaks the signature (SignatureDoesNotMatch error).
  return getSignedUrl(s3Public, new GetObjectCommand({ Bucket: BUCKET, Key: key }), {
    expiresIn: expiresInSeconds,
  });
}

export async function deleteFile(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

/**
 * Delete all objects under a given prefix (e.g. `/{weddingId}/`).
 * Pages through ListObjectsV2 in batches of 1000 and bulk-deletes each page.
 */
export async function deletePrefix(prefix: string): Promise<number> {
  let deleted = 0;
  let continuationToken: string | undefined;

  do {
    const list = await s3.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
    );

    const objects = list.Contents ?? [];
    if (objects.length > 0) {
      await s3.send(
        new DeleteObjectsCommand({
          Bucket: BUCKET,
          Delete: {
            Objects: objects.map((o) => ({ Key: o.Key! })),
            Quiet: true,
          },
        })
      );
      deleted += objects.length;
    }

    continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
  } while (continuationToken);

  return deleted;
}
