idf_component_register(
    SRCS "sm_provision.c"
    INCLUDE_DIRS "."
    REQUIRES sm_device sm_hardware esp_wifi esp_netif esp_event esp_http_server json
)
