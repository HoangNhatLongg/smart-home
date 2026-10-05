idf_component_register(
    SRCS "sm_device_identity.c"
         "sm_device_config.c"
         "sm_device_time.c"
         "sm_topic.c"
         "sm_nvs.c"
    INCLUDE_DIRS "."
    REQUIRES nvs_flash esp_timer json esp_netif
)