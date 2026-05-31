export const TRACKING_CONFIG = {
  // Configurações Gerais
  META_PIXEL_ID: "4001292026668330",
  
  // Ativação dos Canais
  ENABLE_PIXEL: true, // Habilita o rastreamento via Navegador (front-end)
  ENABLE_CAPI: true,  // Habilita o rastreamento via API de Conversões (back-end)
  
  // Código de teste do Gerenciador de Eventos da Meta (ex: TEST12345)
  // Deixe vazio ("") em produção para não enviar eventos de teste
  TEST_EVENT_CODE: "",

  // Modo Debug
  DEBUG_MODE: true, // Mostra logs detalhados dos eventos no console (desative em prod se quiser limpar logs)
  
  // Nomes dos Eventos Padronizados
  EVENTS: {
    PAGE_VIEW: "PageView",
    VIEW_CONTENT: "ViewContent",
    LEAD: "Lead",
    INITIATE_CHECKOUT: "InitiateCheckout",
    PURCHASE: "Purchase",
  },
};
