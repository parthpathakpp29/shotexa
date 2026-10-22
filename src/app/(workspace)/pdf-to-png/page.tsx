import { ConversionPage } from "@/components/tools/conversion/conversion-page";
import { staticMetadata } from "@/config/routes";

export const metadata = staticMetadata("/pdf-to-png");
export default function Page() { return <ConversionPage tool="pdf-to-jpg" variant="pdf-to-png" />; }
