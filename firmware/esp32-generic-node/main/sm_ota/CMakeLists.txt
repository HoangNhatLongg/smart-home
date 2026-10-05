idf_component_register(
    SRCS "sm_ota.c"
    INCLUDE_DIRS "."
    REQUIRES sm_device sm_mqtt json esp_https_ota app_update esp_partition mbedtls freertos
)