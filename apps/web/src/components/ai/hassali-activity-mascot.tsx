"use client";

import Image from "next/image";
import { HASSALI_ACTIVITY_MASCOT_ASSET } from "@/lib/assistant-activity";

type HassaliActivityMascotProps = {
  active: boolean;
  label: string;
};

export function HassaliActivityMascot({
  active,
  label
}: HassaliActivityMascotProps) {
  if (!active) return null;

  return (
    <div
      aria-atomic="true"
      aria-label={label}
      aria-live="polite"
      className="hassali-activity-stage"
      data-hassali-activity="pre-output"
      role="status"
    >
      <div aria-hidden="true" className="hassali-activity-mascot">
        <Image
          alt=""
          className="hassali-activity-image"
          draggable={false}
          height={HASSALI_ACTIVITY_MASCOT_ASSET.sourceSize}
          priority
          src={HASSALI_ACTIVITY_MASCOT_ASSET.path}
          unoptimized
          width={HASSALI_ACTIVITY_MASCOT_ASSET.sourceSize}
        />
      </div>
    </div>
  );
}
