import type {
  GrowthAssertion,
  GrowthEvidence,
  GrowthTruthStatus,
  WebsiteGrowthClaim,
  WebsiteGrowthHandoff,
  WebsiteGrowthOffer
} from "@/lib/server/ai/website-growth-handoff";

export type GrowthObjective =
  | "awareness"
  | "customer_acquisition"
  | "lead_generation"
  | "launch"
  | "retention"
  | "revenue_growth"
  | "seo"
  | "sales_enablement"
  | "validation";

export type GrowthChannel =
  | "communities"
  | "content"
  | "direct_outreach"
  | "email"
  | "paid_ads"
  | "partnerships"
  | "referrals"
  | "seo"
  | "social"
  | "website";

export type GrowthArtifactKind =
  | "campaign_brief"
  | "email_sequence"
  | "experiment_plan"
  | "landing_page_recommendation"
  | "sales_enablement_pack"
  | "seo_brief"
  | "social_content_pack"
  | "strategy_document";

export type GrowthAudience = {
  buyingTriggers: string[];
  decisionCriteria: string[];
  geography: string | null;
  id: string;
  needs: string[];
  objections: string[];
  organizationType: string | null;
  segment: string;
  status: GrowthTruthStatus;
};

export type GrowthBusinessTruth = {
  audiences: GrowthAudience[];
  brandVoice: string[];
  business: {
    category: GrowthAssertion<string>;
    description: GrowthAssertion<string>;
    geography: GrowthAssertion<string>;
    name: GrowthAssertion<string>;
  };
  claims: WebsiteGrowthClaim[];
  constraints: string[];
  evidence: GrowthEvidence[];
  offers: WebsiteGrowthOffer[];
  positioning: {
    differentiators: GrowthAssertion<string[]>;
    valueProposition: GrowthAssertion<string>;
  };
  sourceWebsite: { projectId: string; revision: string } | null;
};

export type GrowthProject = {
  businessTruth: GrowthBusinessTruth;
  createdAt: string;
  ownerId: string;
  projectId: string;
  status: "draft" | "needs_evidence" | "validated";
  version: 1;
};

export type GrowthRequest = {
  artifact: GrowthArtifactKind;
  budget: number | null;
  channels: GrowthChannel[];
  constraints: string[];
  conversionEvent: string | null;
  geographicScope: string | null;
  objective: GrowthObjective;
  prompt: string;
  requestedAudience: string | null;
  timeline: string | null;
};

export type GrowthMeasurement = {
  baseline: number | null;
  metric: string;
  target: number | null;
  unit: "count" | "currency" | "percent" | "rate" | "unknown";
};

export type GrowthCampaign = {
  artifact: GrowthArtifactKind;
  audienceId: string;
  channel: GrowthChannel;
  claims: string[];
  cta: { destination: string; label: string };
  id: string;
  measurement: GrowthMeasurement[];
  message: string;
  objective: GrowthObjective;
  offerId: string;
  projectId: string;
  provenance: { sourceRevision: string | null; type: "growth_project" };
  status: "draft" | "needs_evidence" | "ready_for_approval";
};

export type GrowthStrategy = {
  assumptions: string[];
  businessAudienceIds: string[];
  campaign: GrowthCampaign;
  channels: Array<{ channel: GrowthChannel; rationale: string }>;
  objective: GrowthObjective;
  positioning: string;
  projectId: string;
  risks: string[];
};

export type GrowthValidationIssue = {
  code:
    | "AUDIENCE_MISSING"
    | "BUSINESS_MISSING"
    | "CHANNEL_MISMATCH"
    | "CTA_DESTINATION_MISMATCH"
    | "CTA_MISSING"
    | "DECEPTIVE_GROWTH"
    | "MEASUREMENT_MISSING"
    | "OFFER_MISSING"
    | "UNSUPPORTED_CLAIM";
  message: string;
  severity: "block" | "needs_evidence" | "warning";
};

export type GrowthValidation = {
  issues: GrowthValidationIssue[];
  status: "blocked" | "needs_evidence" | "validated";
};

export type GrowthExperiment = {
  assumptions: string[];
  change: string;
  control: string;
  duration: string | null;
  hypothesis: string;
  metric: string;
  result: "not_started";
  successCriterion: string;
  targetAudience: string;
};

export type GrowthWebsiteSourceCandidate = {
  handoff: WebsiteGrowthHandoff;
  state: "applied" | "pending" | "rejected" | "stale";
};

export type GrowthHandoff =
  | {
      kind: "website_recommendation";
      approvalRequired: true;
      projectId: string;
      targetPage: string;
      recommendation: string;
      cta: string;
      evidenceIds: string[];
      mutatesWebsite: false;
    }
  | {
      kind: "code_recommendation";
      approvalRequired: true;
      projectId: string;
      requirement: string;
      acceptanceCriteria: string[];
      mutatesCode: false;
    }
  | {
      kind: "live_execution_handoff";
      approvalRequired: true;
      projectId: string;
      campaignId: string;
      channel: GrowthChannel;
      executionStatus: "not_executed";
      limits: string[];
    };
