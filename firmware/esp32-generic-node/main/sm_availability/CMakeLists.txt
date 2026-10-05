idf_component_register(
    SRCS "sm_availability.c"
    INCLUDE_DIRS "."
    REQUIRES sm_device sm_mqtt json
)