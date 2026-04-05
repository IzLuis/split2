export type ActionResult<TValues> = {
  success: boolean;
  message: string;
  timestamp: number;
  values: TValues;
  redirectTo?: string;
};

export function buildActionResult<TValues>(input: {
  success: boolean;
  message: string;
  values: TValues;
  redirectTo?: string;
}): ActionResult<TValues> {
  return {
    ...input,
    timestamp: Date.now(),
  };
}

