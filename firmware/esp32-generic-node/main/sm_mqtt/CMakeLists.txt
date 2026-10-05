idf_component_register(
    SRCS "sm_mqtt.c"
    INCLUDE_DIRS "."
    REQUIRES sm_device mqtt json mbedtls freertos
)