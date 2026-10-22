import { ConversionPage } from "@/components/tools/conversion/conversion-page";
import { toolMetadata } from "@/config/routes";

export const metadata = toolMetadata("svg-to-png");
export default function Page() { return <ConversionPage tool="svg-to-png" />; }
