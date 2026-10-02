import { ImageResponse } from "next/og";
import { SocialImage } from "./social-image";

export const alt = "Shotexa screenshot workspace";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(<SocialImage />, size);
}