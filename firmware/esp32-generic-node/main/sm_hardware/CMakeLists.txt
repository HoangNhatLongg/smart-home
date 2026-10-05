idf_component_register(
    SRCS "sm_hardware.c"
         "sm_dht11.c"
         "sm_relay.c"
    INCLUDE_DIRS "."
    REQUIRES sm_device esp_driver_gpio esp_timer
)