import { adminImpersonationErrorReasons, impersonationErrorReasons } from './admin-impersonation';
import { adminLegislationErrorReasons } from './admin-legislation';
import {
  billingChoiceProblemReasonSchema,
  employeesOverStepReason,
  smsRefusalReasons,
} from './billing';
import { clientFileErrorReasons } from './client-files';
import { clientConflictReasons } from './clients';
import { responsiblePersonConflictReasons, workplaceConflictReasons } from './document-data';
import { dutiesAcknowledgementErrorReasons } from './duties-acknowledgements';
import { employeeConflictReasons } from './employees';
import { evaluationProfileErrorReasons } from './evaluation-profiles';
import { safetySheetErrorReasons } from './fire-safety';
import { importErrorReasons } from './imports';
import { invitationErrorReasons } from './invitations';
import { memberErrorReasons, onboardingErrorReasons } from './organizations';
import { bulkInvitationFailureReasons, participantErrorReasons } from './participants';
import { offersNotInPlanReason } from './plan-features';
import { releaseErrorReasons } from './releases';
import { riskEvaluationErrorReasons } from './risk-evaluations';
import { riskZoneErrorReasons } from './risk-zones';
import {
  confirmSignedCopyConflictReason,
  contractReturnConflictReasons,
  serviceContractConflictReasons,
} from './service-contracts';
import { setupErrorReasons } from './setup';
import { signatureErrorReasons } from './signatures';
import { readOnlyReason } from './subscriptions';
import { testErrorReasons } from './tests';

const valuesOf = <T extends Record<string, string>>(reasons: T) =>
  Object.values(reasons) as T[keyof T][];

const otherApiErrorReasons = [
  'aal2_required',
  'agreement_changed',
  'agreement_not_stored',
  'already_signed',
  'already_subscribed',
  'annex_not_in_library',
  'cannot_certify',
  'card_declined',
  'checkout_in_progress',
  'company_details_missing',
  'draft_exists',
  'enterprise_plan',
  'equipment_decided_by_entries',
  'equipment_entries_exist',
  'extras_pending_payment',
  'extras_unavailable',
  'instruction_module_applied',
  'instruction_module_archived',
  'instruction_module_category_domain',
  'instruction_module_domain_applied',
  'instruction_module_other_domain',
  'instruction_module_title_taken',
  'job_position_held',
  'job_position_name_taken',
  'locked_field',
  'member_limit_reached',
  'missing_document_data',
  'missing_sheet_data',
  'no_subscription',
  'not_canceling',
  'not_generated_yet',
  'not_issued',
  'nothing_behind',
  'nothing_to_archive',
  'oblio_login_refused',
  'oblio_refused',
  'oblio_seller_unknown',
  'oblio_unavailable',
  'oblio_unset',
  'pdf_pending',
  'pdf_unavailable',
  'record_not_on_sheet',
  'regeneration_running',
  'row_locked',
  'several_sheets',
  'sheet_busy',
  'signer_refused',
  'signer_unavailable',
  'stripe_not_set_up',
  'stripe_refused',
  'stripe_unavailable',
  'stripe_unset',
  'subscription_exists',
  'substances_listed',
  'substances_not_listed',
  'unchanged',
  'unfilled_text',
  'unknown_fields',
  // Raised by the database with the reason as the message, beside those of the lists above.
  'identity_kept',
  'test_sheet_kept',
  'participant_not_found',
  'material_not_found',
  'attempt_not_found',
] as const;

export const apiErrorReasons = [
  ...valuesOf(adminImpersonationErrorReasons),
  ...valuesOf(impersonationErrorReasons),
  ...valuesOf(adminLegislationErrorReasons),
  ...billingChoiceProblemReasonSchema.options,
  employeesOverStepReason,
  ...smsRefusalReasons,
  ...valuesOf(clientFileErrorReasons),
  ...valuesOf(clientConflictReasons),
  ...valuesOf(workplaceConflictReasons),
  ...valuesOf(responsiblePersonConflictReasons),
  ...valuesOf(dutiesAcknowledgementErrorReasons),
  ...valuesOf(employeeConflictReasons),
  ...evaluationProfileErrorReasons,
  ...valuesOf(safetySheetErrorReasons),
  ...valuesOf(importErrorReasons),
  ...invitationErrorReasons,
  ...memberErrorReasons,
  ...onboardingErrorReasons,
  ...valuesOf(participantErrorReasons),
  bulkInvitationFailureReasons.contactNotSaved,
  offersNotInPlanReason,
  ...releaseErrorReasons,
  ...riskEvaluationErrorReasons,
  ...riskZoneErrorReasons,
  ...valuesOf(serviceContractConflictReasons),
  ...valuesOf(contractReturnConflictReasons),
  confirmSignedCopyConflictReason,
  ...setupErrorReasons,
  ...valuesOf(signatureErrorReasons),
  readOnlyReason,
  ...valuesOf(testErrorReasons),
  ...otherApiErrorReasons,
] as const;

export type ApiErrorReason = (typeof apiErrorReasons)[number];
