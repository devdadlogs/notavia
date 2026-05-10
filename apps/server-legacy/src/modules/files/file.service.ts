import { S3Client, PutObjectCommand, CreateBucketCommand, HeadBucketCommand, PutBucketPolicyCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

export class FileService {
  private s3Client: S3Client;
  private bucketName = 'notavia-assets';

  constructor() {
    this.s3Client = new S3Client({
      region: 'us-east-1',
      endpoint: process.env.MINIO_ENDPOINT || 'http://localhost:9000',
      credentials: {
        accessKeyId: process.env.MINIO_ROOT_USER || 'admin',
        secretAccessKey: process.env.MINIO_ROOT_PASSWORD || 'password123',
      },
      forcePathStyle: true, // Required for MinIO
    });

    this.initBucket();
  }

  private async initBucket() {
    try {
      await this.s3Client.send(new HeadBucketCommand({ Bucket: this.bucketName }));
    } catch (error: any) {
      if (error.$metadata?.httpStatusCode === 404) {
        // Create bucket if it doesn't exist
        await this.s3Client.send(new CreateBucketCommand({ Bucket: this.bucketName }));
        
        // Set public read policy
        const policy = {
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: '*',
              Action: ['s3:GetObject'],
              Resource: [`arn:aws:s3:::${this.bucketName}/*`]
            }
          ]
        };

        await this.s3Client.send(new PutBucketPolicyCommand({
          Bucket: this.bucketName,
          Policy: JSON.stringify(policy)
        }));
      }
    }
  }

  async uploadFile(fileBuffer: Buffer, originalFilename: string, mimeType: string): Promise<string> {
    const ext = path.extname(originalFilename);
    const key = `${uuidv4()}${ext}`;

    await this.s3Client.send(new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: fileBuffer,
      ContentType: mimeType,
    }));

    // Return the public URL
    const endpoint = process.env.MINIO_ENDPOINT || 'http://localhost:9000';
    return `${endpoint}/${this.bucketName}/${key}`;
  }
}
