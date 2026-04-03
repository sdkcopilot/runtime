import type {
  ValidationConfig,
  ValidationConfigObject,
  ValidationPhase,
  ValidationWarning,
  ValidatorFn,
} from "./types.js";

export function resolveValidationConfig(
  configValidation: ValidationConfig | undefined,
  overrideValidation: ValidationConfig | undefined,
): Required<ValidationConfigObject> {
  const base = typeof configValidation === "string"
    ? { input: configValidation, output: configValidation, csv: configValidation }
    : configValidation ?? {};
  const override = typeof overrideValidation === "string"
    ? { input: overrideValidation, output: overrideValidation, csv: overrideValidation }
    : overrideValidation ?? {};

  return {
    input: override.input ?? base.input ?? "off",
    output: override.output ?? base.output ?? "off",
    csv: override.csv ?? override.output ?? base.csv ?? base.output ?? "off",
  };
}

export function toValidationWarnings(
  phase: ValidationPhase,
  errors: ValidatorFn["errors"],
): ValidationWarning[] {
  return (errors ?? []).map((error) => ({
    phase,
    path: error.instancePath || "/",
    message: error.message ?? "Validation error",
  }));
}

export function validateInputSection(
  phase: ValidationPhase,
  validator: ValidatorFn | undefined,
  data: unknown,
): ValidationWarning[] {
  if (!validator) return [];
  const valid = validator(data, { instancePath: "data" });
  if (valid) return [];
  return toValidationWarnings(phase, validator.errors);
}
