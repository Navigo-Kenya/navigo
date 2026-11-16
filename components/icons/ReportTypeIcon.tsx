// components/icons/ReportTypeIcon.tsx
import React, { memo, useMemo } from "react";
import { SvgXml } from "react-native-svg";
import { reportIconSvg } from "./reportIcons";

/**
 * The 3D icon for a map report type (traffic jam, accident, ...).
 * Same artwork as the map pins in assets/images/reports/.
 */
export const ReportTypeIcon = memo(function ReportTypeIcon({
  type,
  size = 44,
}: {
  type: string;
  size?: number;
}) {
  const xml = useMemo(() => reportIconSvg(type, "tile"), [type]);
  return <SvgXml xml={xml} width={size} height={size} />;
});
