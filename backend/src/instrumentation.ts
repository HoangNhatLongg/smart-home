export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const [{ mqttService }, { automationService }] = await Promise.all([
    import('@/lib/mqtt/service'),
    import('@/lib/automation/service'),
  ]);
  mqttService.start();
  automationService.start();
}
