idf_component_register(
    SRCS "sm_command.c"
    INCLUDE_DIRS "."
    REQUIRES sm_device sm_hardware sm_state json
)