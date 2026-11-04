/** Props, option types and shared field classes for the create / edit project form view. */
import type { QuestionnaireAnswers } from '@/data/compliance-questionnaire';
import type { Stage } from '@/lib/projects/stage';
import type {
  CompanyType,
  EntityLegalForm,
  OwnershipType,
  ParentIndianRelationship,
} from '@/data/engagements';

export type CreateProjectOwnerOption = {
  id: string;
  name: string;
  initials: string;
  email?: string;
};

export type CreateProjectFieldErrorKey =
  | 'companyName'
  | 'companyType'
  | 'parentIndianRelationship'
  | 'subsidiaryLegalName'
  | 'subsidiaryRegisteredAddress'
  | 'parentEntityName'
  | 'parentEntityAddress'
  | 'clientEmail'
  | 'clientPassword'
  | 'managerId'
  | 'internId';

export const fieldLabelClass =
  'flex items-center gap-1.5 text-[12.5px] font-medium text-ink-muted';
export const fieldControlClass = 'mt-2 h-11 px-3.5 text-[14px]';

export type CreateProjectFormViewProps = {
  onCancel?: () => void;
  submitting: boolean;
  companyName: string;
  setCompanyName: (value: string) => void;
  ownershipType: OwnershipType;
  setOwnershipType: (value: OwnershipType) => void;
  companyType: CompanyType;
  setCompanyType: (value: CompanyType) => void;
  /** Indian subsidiary only; null = not applicable or not yet chosen. */
  parentIndianRelationship: ParentIndianRelationship | null;
  setParentIndianRelationship: (value: ParentIndianRelationship) => void;
  entityLegalForm: EntityLegalForm;
  setEntityLegalForm: (value: EntityLegalForm) => void;
  subsidiaryLegalName: string;
  setSubsidiaryLegalName: (value: string) => void;
  subsidiaryRegisteredAddress: string;
  setSubsidiaryRegisteredAddress: (value: string) => void;
  parentEntityName: string;
  setParentEntityName: (value: string) => void;
  parentEntityAddress: string;
  setParentEntityAddress: (value: string) => void;
  clientContact: string;
  setClientContact: (value: string) => void;
  clientEmail: string;
  setClientEmail: (value: string) => void;
  clientPassword: string;
  setClientPassword: (value: string) => void;
  internIds: string[];
  setInternIds: (value: string[]) => void;
  managerIds: string[];
  setManagerIds: (value: string[]) => void;
  /** When true, first manager slot is fixed to the signed-in manager. */
  lockFirstManager: boolean;
  selfManagerId: string;
  showManagerPicker: boolean;
  managers: Array<{ id: string; name: string; email: string }>;
  managersLoading: boolean;
  stage: Stage;
  setStage: (value: Stage) => void;
  questionnaire: QuestionnaireAnswers;
  setQuestionnaire: (value: QuestionnaireAnswers) => void;
  showPassword: boolean;
  setShowPassword: (value: boolean) => void;
  owners: CreateProjectOwnerOption[];
  internsLoading: boolean;
  fieldError: (key: CreateProjectFieldErrorKey) => string;
  pwStrength: 'weak' | 'fair' | 'strong' | null;
  submit: () => void | Promise<void>;
  saveDraft: () => void;
  companyTypeValid: boolean;
  canSubmit: boolean;
  /** Editing an existing project — same form, PATCH semantics. */
  editMode?: boolean;
  /** Current portal sign-in, shown read-only while editing. */
  existingClientEmail?: string;
  /** Opens the change-client dialog from the edit form. */
  onChangeClientEmail?: () => void;
  /** False hides the change action (no client on the project yet, or no rights). */
  canChangeClientEmail?: boolean;
  /** Managers file a request instead of applying it — the button says so. */
  changeClientNeedsApproval?: boolean;
};
