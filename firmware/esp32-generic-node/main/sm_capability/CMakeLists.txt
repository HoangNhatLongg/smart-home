idf_component_register(
    SRCS "sm_capability.c"
    INCLUDE_DIRS "."
    REQUIRES sm_device sm_hardware sm_mqtt json
)