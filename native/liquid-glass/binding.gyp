{
  "targets": [
    {
      "target_name": "mimessage_liquid_glass",
      "conditions": [
        [
          "OS==\"mac\"",
          {
            "sources": ["liquid_glass.mm"],
            "defines": ["NAPI_VERSION=8"],
            "xcode_settings": {
              "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
              "CLANG_ENABLE_OBJC_ARC": "YES",
              "MACOSX_DEPLOYMENT_TARGET": "13.0",
              "OTHER_LDFLAGS": ["-framework AppKit"]
            }
          }
        ]
      ]
    }
  ]
}
