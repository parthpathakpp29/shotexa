import { MetadataLanding } from "@/components/tools/metadata/metadata-landing";
import { MetadataTool } from "@/components/tools/metadata/metadata-tool";
import { toolMetadata } from "@/config/routes";

export const metadata = toolMetadata("metadata");

export default function RemoveImageMetadataPage() {
  return <MetadataTool landing={<MetadataLanding />} />;
}
