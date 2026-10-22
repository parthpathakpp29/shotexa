import { RasterFormatPage } from "@/components/tools/conversion/raster-format-page";
import { staticMetadata } from "@/config/routes";

export const metadata = staticMetadata("/webp-to-png");
export default function Page() { return <RasterFormatPage id="webp-to-png" />; }
