import { RasterFormatPage } from "@/components/tools/conversion/raster-format-page";
import { staticMetadata } from "@/config/routes";

export const metadata = staticMetadata("/jpg-to-png");
export default function Page() { return <RasterFormatPage id="jpg-to-png" />; }
