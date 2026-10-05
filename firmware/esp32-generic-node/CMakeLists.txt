cmake_minimum_required(VERSION 3.16)

# Generic ESP32-C3 IoT Node.
#
# Module layout follows docs/PROJECT_STRUCTURE.md (firmware/esp32-generic-node/main/<module>)
# but IDF component names must not collide with ESP-IDF component names
# (e.g. an IDF component named "mqtt" already exists), therefore every module
# directory is prefixed with "sm_".
set(NODE_MODULE_DIRS
    "${CMAKE_CURRENT_LIST_DIR}/main/sm_device"
    "${CMAKE_CURRENT_LIST_DIR}/main/sm_hardware"
    "${CMAKE_CURRENT_LIST_DIR}/main/sm_mqtt"
    "${CMAKE_CURRENT_LIST_DIR}/main/sm_availability"
    "${CMAKE_CURRENT_LIST_DIR}/main/sm_capability"
    "${CMAKE_CURRENT_LIST_DIR}/main/sm_telemetry"
    "${CMAKE_CURRENT_LIST_DIR}/main/sm_state"
    "${CMAKE_CURRENT_LIST_DIR}/main/sm_command"
    "${CMAKE_CURRENT_LIST_DIR}/main/sm_configuration"
    "${CMAKE_CURRENT_LIST_DIR}/main/sm_ota"
    "${CMAKE_CURRENT_LIST_DIR}/main/sm_app"
)
set(EXTRA_COMPONENT_DIRS ${NODE_MODULE_DIRS})

# Single source of truth for the firmware version: NODE_FIRMWARE_VERSION in
# main/Kconfig.projbuild. It is parsed here so the ESP image descriptor and the
# capability message published over MQTT always carry the same version.
set(SM_FIRMWARE_VERSION "")
file(STRINGS "${CMAKE_CURRENT_LIST_DIR}/main/Kconfig.projbuild" SM_KCONFIG_LINES)
set(SM_IN_VERSION_BLOCK FALSE)
foreach(SM_KCONFIG_LINE IN LISTS SM_KCONFIG_LINES)
    string(STRIP "${SM_KCONFIG_LINE}" SM_KCONFIG_LINE)
    if(SM_IN_VERSION_BLOCK AND SM_KCONFIG_LINE MATCHES "^default \"([0-9]+\\.[0-9]+\\.[0-9]+)\"$")
        set(SM_FIRMWARE_VERSION "${CMAKE_MATCH_1}")
        break()
    endif()
    if(SM_KCONFIG_LINE STREQUAL "config NODE_FIRMWARE_VERSION")
        set(SM_IN_VERSION_BLOCK TRUE)
    endif()
endforeach()

if(SM_FIRMWARE_VERSION STREQUAL "")
    set(SM_FIRMWARE_VERSION "0.0.0")
    message(WARNING "NODE_FIRMWARE_VERSION default not found in main/Kconfig.projbuild")
endif()
message(STATUS "Firmware version: ${SM_FIRMWARE_VERSION}")

include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(esp32-generic-node VERSION ${SM_FIRMWARE_VERSION})