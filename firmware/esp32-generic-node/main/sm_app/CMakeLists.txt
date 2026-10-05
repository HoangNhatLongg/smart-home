idf_component_register(
    SRCS "sm_app.c"
         "sm_wifi.c"
    INCLUDE_DIRS "."
    REQUIRES sm_device sm_hardware sm_mqtt sm_availability sm_capability sm_telemetry
             sm_state sm_command sm_configuration sm_ota sm_provision
             esp_wifi esp_netif esp_event nvs_flash json spi_flash
)