import { EncodeTool } from "@/components/tools/encode/encode-tool";
import { ToolLanding } from "@/components/workspace/tool-landing";
import { FORMAT_CONVERSIONS } from "@/config/format-conversions";
import { FormatEducation } from "./format-education";

export function RasterFormatPage({ id }: { id: "webp-to-png" | "webp-to-jpg" | "png-to-jpg" | "jpg-to-png" }) {
  const conversion = FORMAT_CONVERSIONS[id];
  if (!conversion.rasterSource || !conversion.rasterOutput) throw new Error(`No raster preset for ${id}`);
  return <EncodeTool tool="convert" preset={{ source: conversion.rasterSource, target: conversion.rasterOutput, h1: conversion.h1, name: conversion.name }} landing={
    <ToolLanding tool="convert" variant={conversion} dropHint={`or drop a ${conversion.source} image here`} fileLabel={`${conversion.source} image`} showEducation={false}>
      <FormatEducation conversion={conversion} />
    </ToolLanding>
  } />;
}
