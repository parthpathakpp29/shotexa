import { ConversionPage } from "@/components/tools/conversion/conversion-page";
import { staticMetadata } from "@/config/routes";

export const metadata = staticMetadata("/svg-to-jpg");
export default function Page() { return <ConversionPage tool="svg-to-png" variant="svg-to-jpg" />; }
