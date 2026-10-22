import { ConversionPage } from "@/components/tools/conversion/conversion-page";
import { toolMetadata } from "@/config/routes";

export const metadata = toolMetadata("pdf-to-jpg");
export default function Page() { return <ConversionPage tool="pdf-to-jpg" />; }
