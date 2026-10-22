import { ComparisonPage } from "@/components/alternatives/comparison-page";
import { CONVERTER_COMPARISONS } from "@/config/converter-comparisons";
import { staticMetadata } from "@/config/routes";

export const metadata = staticMetadata("/alternatives/convertio");
export default function Page() { return <ComparisonPage comparison={CONVERTER_COMPARISONS.convertio} />; }
