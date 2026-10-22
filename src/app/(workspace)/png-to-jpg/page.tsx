import { RasterFormatPage } from "@/components/tools/conversion/raster-format-page";
import { staticMetadata } from "@/config/routes";

export const metadata = staticMetadata("/png-to-jpg");
export default function Page() { return <RasterFormatPage id="png-to-jpg" />; }
