import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3 = new S3Client({
  endpoint: process.env.AWS_ENDPOINT_URL!,
  region: process.env.AWS_DEFAULT_REGION ?? "auto",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
  // S3_FORCE_PATH_STYLE=true required for local MinIO (uses http://host/bucket/key).
  // Must be false (unset) for Railway Buckets/Tigris which uses virtual-hosted style (http://bucket.host/key).
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
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
  const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), {
    expiresIn: expiresInSeconds,
  });

  // In local dev, the S3 client endpoint is the Docker-internal hostname (e.g. http://minio:9000)
  // but presigned URLs must be browser-accessible. S3_PUBLIC_ENDPOINT_URL overrides the host
  // in the generated URL so the browser can reach MinIO directly (e.g. http://192.168.6.249:9000).
  // In production (Railway/Tigris) this var is not set and the URL is used as-is.
  const publicEndpoint = process.env.S3_PUBLIC_ENDPOINT_URL;
  if (publicEndpoint && process.env.AWS_ENDPOINT_URL && publicEndpoint !== process.env.AWS_ENDPOINT_URL) {
    return url.replace(process.env.AWS_ENDPOINT_URL, publicEndpoint);
  }

  return url;
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
