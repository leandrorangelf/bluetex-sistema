export function isVhsysManaged(
  record: { origem_sistema?: string | null },
): boolean {
  return record.origem_sistema === 'vhsys'
}
