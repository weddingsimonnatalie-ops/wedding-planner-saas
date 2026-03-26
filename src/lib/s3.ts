import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3 = new S3Client({
  endpoint: process.env.AWS_ENDPOINT_URL!,
  region: process.env.AWS_DEFAULT_REGION ?? "auto",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: false,
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
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), {
    expiresIn: expiresInSeconds,
  });
}

export async function deleteFile(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}
