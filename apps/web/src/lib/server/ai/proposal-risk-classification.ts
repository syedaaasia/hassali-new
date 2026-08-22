export type ProposalFailureClass =
  | "authority_integrity"
  | "content_quality"
  | "generation_structural"
  | "hard_safety"
  | "unknown_validation";

export function classifyProposalFailure(code: string): ProposalFailureClass {
  if (/(?:security|authorization|ownership|cross[_-]?project|secret|path[_-]?traversal|dangerous|unauthorized)/i.test(code)) {
    return "hard_safety";
  }
  if (/(?:prompt_sovereignty|stale_proposal|authority|project_identity|canonical_identity|design_authority)/i.test(code)) {
    return "authority_integrity";
  }
  if (/^(?:website_(?:structure|validation|generation)_block|website_generation_(?:contract|empty)|domain_validation_block)$/i.test(code)) {
    return "generation_structural";
  }
  if (/^(?:website_(?:content_quality|domain_semantic)_block)$/i.test(code)) {
    return "content_quality";
  }
  return "unknown_validation";
}

export function isHardProposalFailure(code: string) {
  const failureClass = classifyProposalFailure(code);
  return failureClass === "hard_safety" || failureClass === "authority_integrity";
}

export function isRepairableProposalFailure(code: string) {
  const failureClass = classifyProposalFailure(code);
  return failureClass === "generation_structural" || failureClass === "content_quality";
}
