export async function register() { if (process.env.NEXT_RUNTIME === 'nodejs') { const { mqttService } = await import('@/lib/mqtt/service'); mqttService.start(); } }
