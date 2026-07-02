/**
 * Enforcement do MFA (verificação em duas etapas).
 *
 * Controlado pela env `MFA_ENFORCED`:
 *   - "true"  → MFA obrigatório (login exige código; enrollment forçado).
 *   - qualquer outro valor / ausente → MFA em STANDBY (fase de testes):
 *     login é só e-mail+senha e não há enrollment forçado.
 *
 * Reversível sem mudança de código — basta setar/limpar a env no deploy.
 */
export function mfaEnforced(): boolean {
  return process.env.MFA_ENFORCED === "true";
}
