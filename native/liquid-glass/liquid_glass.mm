#include <node_api.h>

#import <AppKit/AppKit.h>
#import <dispatch/dispatch.h>
#import <objc/runtime.h>

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <string>

#if __has_include(<AppKit/NSGlassEffectView.h>)
#import <AppKit/NSGlassEffectView.h>
#define MIMESSAGE_HAS_GLASS_SDK 1
#else
#define MIMESSAGE_HAS_GLASS_SDK 0
#endif

namespace {

enum class GlassStyle {
  Regular,
  Clear,
};

struct GlassFrame {
  double x = 0;
  double y = 0;
  double width = 0;
  double height = 0;
  bool has_width = false;
  bool has_height = false;
};

struct GlassConfiguration {
  GlassStyle style = GlassStyle::Regular;
  bool has_tint = false;
  double tint_red = 0;
  double tint_green = 0;
  double tint_blue = 0;
  double tint_alpha = 1;
  double corner_radius = 0;
  double spacing = 0;
  bool has_frame = false;
  GlassFrame frame;
};

struct GlassOptionsPatch {
  bool has_style = false;
  GlassStyle style = GlassStyle::Regular;
  bool has_tint = false;
  bool tint_is_null = false;
  double tint_red = 0;
  double tint_green = 0;
  double tint_blue = 0;
  double tint_alpha = 1;
  bool has_corner_radius = false;
  double corner_radius = 0;
  bool has_spacing = false;
  double spacing = 0;
  bool has_frame = false;
  bool frame_is_null = false;
  GlassFrame frame;
};

struct NativeSupport {
  bool supported = false;
  std::string reason;
};

struct OperationResult {
  bool supported = false;
  bool applied = false;
  bool attached = false;
  std::string reason;
};

}  // namespace

#if MIMESSAGE_HAS_GLASS_SDK

API_AVAILABLE(macos(26.0))
@interface MMLiquidGlassState : NSObject {
 @public
  GlassConfiguration configuration;
}

@property(nonatomic, weak) NSView *hostView;
@property(nonatomic, strong) NSGlassEffectContainerView *containerView;
@property(nonatomic, strong) NSView *glassContentView;
@property(nonatomic, strong) NSGlassEffectView *glassView;

@end

@implementation MMLiquidGlassState
@end

static const void *kLiquidGlassStateKey = &kLiquidGlassStateKey;

#endif

namespace {

NativeSupport GetNativeSupport() {
#if MIMESSAGE_HAS_GLASS_SDK
  if (@available(macOS 26.0, *)) {
    if (NSClassFromString(@"NSGlassEffectView") != Nil &&
        NSClassFromString(@"NSGlassEffectContainerView") != Nil) {
      return {true, ""};
    }
    return {false, "glass-classes-unavailable"};
  }
  return {false, "requires-macos-26"};
#else
  return {false, "requires-xcode-26-sdk"};
#endif
}

void ThrowTypeError(napi_env env, const char *message) {
  napi_throw_type_error(env, nullptr, message);
}

bool IsNull(napi_env env, napi_value value) {
  napi_value null_value;
  bool is_null = false;
  napi_get_null(env, &null_value);
  napi_strict_equals(env, value, null_value, &is_null);
  return is_null;
}

bool GetOptionalProperty(napi_env env, napi_value object, const char *name,
                         napi_value *value, bool *present) {
  if (napi_has_named_property(env, object, name, present) != napi_ok) {
    return false;
  }
  if (!*present) {
    return true;
  }
  return napi_get_named_property(env, object, name, value) == napi_ok;
}

bool ReadFiniteNumber(napi_env env, napi_value value, const char *error_message,
                      double *result) {
  napi_valuetype type;
  if (napi_typeof(env, value, &type) != napi_ok || type != napi_number ||
      napi_get_value_double(env, value, result) != napi_ok ||
      !std::isfinite(*result)) {
    ThrowTypeError(env, error_message);
    return false;
  }
  return true;
}

bool ReadRequiredNumberProperty(napi_env env, napi_value object,
                                const char *name, const char *error_message,
                                double *result) {
  napi_value value;
  bool present = false;
  if (!GetOptionalProperty(env, object, name, &value, &present) || !present) {
    ThrowTypeError(env, error_message);
    return false;
  }
  return ReadFiniteNumber(env, value, error_message, result);
}

bool ReadOptionalNumberProperty(napi_env env, napi_value object,
                                const char *name, const char *error_message,
                                double *result, bool *present) {
  napi_value value;
  if (!GetOptionalProperty(env, object, name, &value, present)) {
    ThrowTypeError(env, error_message);
    return false;
  }
  if (!*present) {
    return true;
  }
  return ReadFiniteNumber(env, value, error_message, result);
}

bool ReadString(napi_env env, napi_value value, const char *error_message,
                std::string *result) {
  napi_valuetype type;
  if (napi_typeof(env, value, &type) != napi_ok || type != napi_string) {
    ThrowTypeError(env, error_message);
    return false;
  }

  size_t length = 0;
  if (napi_get_value_string_utf8(env, value, nullptr, 0, &length) != napi_ok) {
    ThrowTypeError(env, error_message);
    return false;
  }
  std::string buffer(length + 1, '\0');
  size_t copied = 0;
  if (napi_get_value_string_utf8(env, value, buffer.data(), buffer.size(),
                                 &copied) != napi_ok) {
    ThrowTypeError(env, error_message);
    return false;
  }
  buffer.resize(copied);
  *result = std::move(buffer);
  return true;
}

bool ReadObject(napi_env env, napi_value value, const char *error_message) {
  napi_valuetype type;
  if (napi_typeof(env, value, &type) != napi_ok || type != napi_object ||
      IsNull(env, value)) {
    ThrowTypeError(env, error_message);
    return false;
  }
  return true;
}

bool ParseTint(napi_env env, napi_value value, GlassOptionsPatch *patch) {
  patch->has_tint = true;
  if (IsNull(env, value)) {
    patch->tint_is_null = true;
    return true;
  }
  if (!ReadObject(env, value,
                  "tintColor must be null or an object with red, green, and blue")) {
    return false;
  }
  if (!ReadRequiredNumberProperty(
          env, value, "red", "tintColor.red must be a finite number",
          &patch->tint_red) ||
      !ReadRequiredNumberProperty(
          env, value, "green", "tintColor.green must be a finite number",
          &patch->tint_green) ||
      !ReadRequiredNumberProperty(
          env, value, "blue", "tintColor.blue must be a finite number",
          &patch->tint_blue)) {
    return false;
  }

  bool has_alpha = false;
  if (!ReadOptionalNumberProperty(
          env, value, "alpha", "tintColor.alpha must be a finite number",
          &patch->tint_alpha, &has_alpha)) {
    return false;
  }
  if (!has_alpha) {
    patch->tint_alpha = 1;
  }

  const double components[] = {patch->tint_red, patch->tint_green,
                               patch->tint_blue, patch->tint_alpha};
  for (double component : components) {
    if (component < 0 || component > 1) {
      ThrowTypeError(env, "tintColor components must be between 0 and 1");
      return false;
    }
  }
  return true;
}

bool ParseFrame(napi_env env, napi_value value, GlassOptionsPatch *patch) {
  patch->has_frame = true;
  if (IsNull(env, value)) {
    patch->frame_is_null = true;
    return true;
  }
  if (!ReadObject(env, value, "frame must be null or an object")) {
    return false;
  }

  bool has_x = false;
  bool has_y = false;
  if (!ReadOptionalNumberProperty(env, value, "x",
                                  "frame.x must be a finite number",
                                  &patch->frame.x, &has_x) ||
      !ReadOptionalNumberProperty(env, value, "y",
                                  "frame.y must be a finite number",
                                  &patch->frame.y, &has_y) ||
      !ReadOptionalNumberProperty(env, value, "width",
                                  "frame.width must be a finite number",
                                  &patch->frame.width,
                                  &patch->frame.has_width) ||
      !ReadOptionalNumberProperty(env, value, "height",
                                  "frame.height must be a finite number",
                                  &patch->frame.height,
                                  &patch->frame.has_height)) {
    return false;
  }

  if (!has_x) {
    patch->frame.x = 0;
  }
  if (!has_y) {
    patch->frame.y = 0;
  }
  if (patch->frame.x < 0 || patch->frame.y < 0 ||
      (patch->frame.has_width && patch->frame.width <= 0) ||
      (patch->frame.has_height && patch->frame.height <= 0)) {
    ThrowTypeError(env,
                   "frame x/y must be non-negative and width/height must be positive");
    return false;
  }
  return true;
}

bool ParseOptions(napi_env env, napi_value value, GlassOptionsPatch *patch) {
  if (value == nullptr) {
    return true;
  }
  napi_valuetype type;
  if (napi_typeof(env, value, &type) != napi_ok) {
    ThrowTypeError(env, "options must be an object");
    return false;
  }
  if (type == napi_undefined || IsNull(env, value)) {
    return true;
  }
  if (!ReadObject(env, value, "options must be an object")) {
    return false;
  }

  napi_value property;
  bool present = false;
  if (!GetOptionalProperty(env, value, "style", &property, &present)) {
    ThrowTypeError(env, "unable to read style");
    return false;
  }
  if (present) {
    std::string style;
    if (!ReadString(env, property, "style must be \"regular\" or \"clear\"",
                    &style)) {
      return false;
    }
    if (style == "regular") {
      patch->style = GlassStyle::Regular;
    } else if (style == "clear") {
      patch->style = GlassStyle::Clear;
    } else {
      ThrowTypeError(env, "style must be \"regular\" or \"clear\"");
      return false;
    }
    patch->has_style = true;
  }

  if (!GetOptionalProperty(env, value, "tintColor", &property, &present)) {
    ThrowTypeError(env, "unable to read tintColor");
    return false;
  }
  if (present && !ParseTint(env, property, patch)) {
    return false;
  }

  if (!ReadOptionalNumberProperty(env, value, "cornerRadius",
                                  "cornerRadius must be a finite number",
                                  &patch->corner_radius,
                                  &patch->has_corner_radius) ||
      !ReadOptionalNumberProperty(env, value, "spacing",
                                  "spacing must be a finite number",
                                  &patch->spacing, &patch->has_spacing)) {
    return false;
  }
  if ((patch->has_corner_radius && patch->corner_radius < 0) ||
      (patch->has_spacing && patch->spacing < 0)) {
    ThrowTypeError(env, "cornerRadius and spacing must be non-negative");
    return false;
  }

  if (!GetOptionalProperty(env, value, "frame", &property, &present)) {
    ThrowTypeError(env, "unable to read frame");
    return false;
  }
  return !present || ParseFrame(env, property, patch);
}

bool ParseWindowHandle(napi_env env, napi_value value, void **pointer) {
  bool is_buffer = false;
  if (value == nullptr || napi_is_buffer(env, value, &is_buffer) != napi_ok ||
      !is_buffer) {
    ThrowTypeError(env,
                   "windowHandle must be the Buffer returned by getNativeWindowHandle()");
    return false;
  }

  void *data = nullptr;
  size_t length = 0;
  if (napi_get_buffer_info(env, value, &data, &length) != napi_ok ||
      data == nullptr || length != sizeof(void *)) {
    ThrowTypeError(env, "windowHandle does not contain a native pointer");
    return false;
  }

  void *raw_pointer = nullptr;
  std::memcpy(&raw_pointer, data, sizeof(raw_pointer));
  if (raw_pointer == nullptr ||
      reinterpret_cast<uintptr_t>(raw_pointer) % alignof(void *) != 0) {
    ThrowTypeError(env, "windowHandle contains an invalid native pointer");
    return false;
  }
  *pointer = raw_pointer;
  return true;
}

void ApplyPatch(const GlassOptionsPatch &patch,
                GlassConfiguration *configuration) {
  if (patch.has_style) {
    configuration->style = patch.style;
  }
  if (patch.has_tint) {
    configuration->has_tint = !patch.tint_is_null;
    if (!patch.tint_is_null) {
      configuration->tint_red = patch.tint_red;
      configuration->tint_green = patch.tint_green;
      configuration->tint_blue = patch.tint_blue;
      configuration->tint_alpha = patch.tint_alpha;
    }
  }
  if (patch.has_corner_radius) {
    configuration->corner_radius = patch.corner_radius;
  }
  if (patch.has_spacing) {
    configuration->spacing = patch.spacing;
  }
  if (patch.has_frame) {
    configuration->has_frame = !patch.frame_is_null;
    if (!patch.frame_is_null) {
      configuration->frame = patch.frame;
    }
  }
}

#if MIMESSAGE_HAS_GLASS_SDK

NSRect FrameForConfiguration(NSView *host,
                             const GlassConfiguration &configuration) {
  NSRect bounds = host.bounds;
  if (!configuration.has_frame) {
    return bounds;
  }

  const GlassFrame &frame = configuration.frame;
  CGFloat width = frame.has_width
                      ? static_cast<CGFloat>(frame.width)
                      : std::max<CGFloat>(0, NSWidth(bounds) - frame.x);
  CGFloat height = frame.has_height
                       ? static_cast<CGFloat>(frame.height)
                       : std::max<CGFloat>(0, NSHeight(bounds) - frame.y);
  CGFloat x = NSMinX(bounds) + static_cast<CGFloat>(frame.x);
  CGFloat y = NSMaxY(bounds) - static_cast<CGFloat>(frame.y) - height;
  return NSMakeRect(x, y, width, height);
}

void ApplyConfiguration(MMLiquidGlassState *state) API_AVAILABLE(macos(26.0)) {
  NSView *host = state.glassContentView;
  if (host == nil) {
    return;
  }

  const GlassConfiguration &configuration = state->configuration;
  state.containerView.spacing = static_cast<CGFloat>(configuration.spacing);
  state.glassView.style = configuration.style == GlassStyle::Clear
                              ? NSGlassEffectViewStyleClear
                              : NSGlassEffectViewStyleRegular;
  state.glassView.cornerRadius =
      static_cast<CGFloat>(configuration.corner_radius);
  state.glassView.tintColor = configuration.has_tint
                                  ? [NSColor colorWithSRGBRed:configuration.tint_red
                                                       green:configuration.tint_green
                                                        blue:configuration.tint_blue
                                                       alpha:configuration.tint_alpha]
                                  : nil;

  state.glassView.frame = FrameForConfiguration(host, configuration);
  if (!configuration.has_frame) {
    state.glassView.autoresizingMask =
        NSViewWidthSizable | NSViewHeightSizable;
    return;
  }

  NSAutoresizingMaskOptions mask = NSViewNotSizable;
  if (!configuration.frame.has_width) {
    mask |= NSViewWidthSizable;
  }
  if (!configuration.frame.has_height) {
    mask |= NSViewHeightSizable;
  } else {
    mask |= NSViewMinYMargin;
  }
  state.glassView.autoresizingMask = mask;
}

MMLiquidGlassState *StateForWindow(NSWindow *window)
    API_AVAILABLE(macos(26.0)) {
  return objc_getAssociatedObject(window, kLiquidGlassStateKey);
}

OperationResult AddGlass(void *pointer, const GlassOptionsPatch &patch) {
  NativeSupport support = GetNativeSupport();
  if (!support.supported) {
    return {false, false, false, support.reason};
  }

  if (@available(macOS 26.0, *)) {
    NSView *native_view = (__bridge NSView *)pointer;
    if (![native_view isKindOfClass:[NSView class]]) {
      return {true, false, false, "invalid-window-handle"};
    }
    NSWindow *window = native_view.window;
    if (window == nil) {
      return {true, false, false, "window-not-ready"};
    }
    NSView *native_superview = native_view.superview;
    if (native_superview == nil) {
      return {true, false, false, "window-not-ready"};
    }
    if (StateForWindow(window) != nil) {
      return {true, false, true, "already-attached"};
    }

    MMLiquidGlassState *state = [[MMLiquidGlassState alloc] init];
    state->configuration = GlassConfiguration{};
    ApplyPatch(patch, &state->configuration);
    state.hostView = native_view;

    NSGlassEffectContainerView *container =
        [[NSGlassEffectContainerView alloc] initWithFrame:native_view.frame];
    container.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;

    NSView *content = [[NSView alloc] initWithFrame:container.bounds];
    content.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    container.contentView = content;

    NSGlassEffectView *glass =
        [[NSGlassEffectView alloc] initWithFrame:content.bounds];
    [content addSubview:glass];

    state.containerView = container;
    state.glassContentView = content;
    state.glassView = glass;
    ApplyConfiguration(state);

    [native_superview addSubview:container
                      positioned:NSWindowBelow
                      relativeTo:native_view];
    objc_setAssociatedObject(window, kLiquidGlassStateKey, state,
                             OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    return {true, true, true, ""};
  }
  return {false, false, false, "requires-macos-26"};
}

OperationResult UpdateGlass(void *pointer, const GlassOptionsPatch &patch) {
  NativeSupport support = GetNativeSupport();
  if (!support.supported) {
    return {false, false, false, support.reason};
  }

  if (@available(macOS 26.0, *)) {
    NSView *native_view = (__bridge NSView *)pointer;
    if (![native_view isKindOfClass:[NSView class]]) {
      return {true, false, false, "invalid-window-handle"};
    }
    NSWindow *window = native_view.window;
    if (window == nil) {
      return {true, false, false, "window-not-ready"};
    }
    MMLiquidGlassState *state = StateForWindow(window);
    if (state == nil) {
      return {true, false, false, "not-attached"};
    }

    ApplyPatch(patch, &state->configuration);
    ApplyConfiguration(state);
    return {true, true, true, ""};
  }
  return {false, false, false, "requires-macos-26"};
}

OperationResult RemoveGlass(void *pointer) {
  NativeSupport support = GetNativeSupport();
  if (!support.supported) {
    return {false, false, false, support.reason};
  }

  if (@available(macOS 26.0, *)) {
    NSView *native_view = (__bridge NSView *)pointer;
    if (![native_view isKindOfClass:[NSView class]]) {
      return {true, false, false, "invalid-window-handle"};
    }
    NSWindow *window = native_view.window;
    if (window == nil) {
      return {true, false, false, "window-not-ready"};
    }
    MMLiquidGlassState *state = StateForWindow(window);
    if (state == nil) {
      return {true, false, false, "not-attached"};
    }

    [state.containerView removeFromSuperview];
    objc_setAssociatedObject(window, kLiquidGlassStateKey, nil,
                             OBJC_ASSOCIATION_ASSIGN);
    return {true, true, false, ""};
  }
  return {false, false, false, "requires-macos-26"};
}

#else

OperationResult AddGlass(void *, const GlassOptionsPatch &) {
  return {false, false, false, "requires-xcode-26-sdk"};
}

OperationResult UpdateGlass(void *, const GlassOptionsPatch &) {
  return {false, false, false, "requires-xcode-26-sdk"};
}

OperationResult RemoveGlass(void *) {
  return {false, false, false, "requires-xcode-26-sdk"};
}

#endif

OperationResult PerformOnMainThread(void *pointer,
                                    const GlassOptionsPatch *patch,
                                    const char *operation) {
  __block OperationResult result;
  dispatch_block_t work = ^{
    @autoreleasepool {
      if (std::strcmp(operation, "add") == 0) {
        result = AddGlass(pointer, *patch);
      } else if (std::strcmp(operation, "update") == 0) {
        result = UpdateGlass(pointer, *patch);
      } else {
        result = RemoveGlass(pointer);
      }
    }
  };

  if ([NSThread isMainThread]) {
    work();
  } else {
    dispatch_sync(dispatch_get_main_queue(), work);
  }
  return result;
}

void SetBoolean(napi_env env, napi_value object, const char *name, bool value) {
  napi_value js_value;
  napi_get_boolean(env, value, &js_value);
  napi_set_named_property(env, object, name, js_value);
}

void SetString(napi_env env, napi_value object, const char *name,
               const std::string &value) {
  napi_value js_value;
  napi_create_string_utf8(env, value.c_str(), value.size(), &js_value);
  napi_set_named_property(env, object, name, js_value);
}

napi_value BuildSupportResult(napi_env env, const NativeSupport &support) {
  napi_value result;
  napi_create_object(env, &result);
  SetBoolean(env, result, "supported", support.supported);
  SetString(env, result, "minimumSystemVersion", "26.0");
  if (!support.reason.empty()) {
    SetString(env, result, "reason", support.reason);
  }
  return result;
}

napi_value BuildOperationResult(napi_env env,
                                const OperationResult &operation_result) {
  napi_value result;
  napi_create_object(env, &result);
  SetBoolean(env, result, "supported", operation_result.supported);
  SetBoolean(env, result, "applied", operation_result.applied);
  SetBoolean(env, result, "attached", operation_result.attached);
  if (!operation_result.reason.empty()) {
    SetString(env, result, "reason", operation_result.reason);
  }
  return result;
}

napi_value Support(napi_env env, napi_callback_info info) {
  return BuildSupportResult(env, GetNativeSupport());
}

napi_value Mutate(napi_env env, napi_callback_info info, const char *operation) {
  size_t argument_count = 2;
  napi_value arguments[2] = {nullptr, nullptr};
  if (napi_get_cb_info(env, info, &argument_count, arguments, nullptr, nullptr) !=
      napi_ok ||
      argument_count < 1) {
    ThrowTypeError(env, "a native window handle is required");
    return nullptr;
  }

  void *pointer = nullptr;
  if (!ParseWindowHandle(env, arguments[0], &pointer)) {
    return nullptr;
  }

  GlassOptionsPatch patch;
  if (std::strcmp(operation, "remove") != 0 &&
      !ParseOptions(env, argument_count > 1 ? arguments[1] : nullptr, &patch)) {
    return nullptr;
  }

  return BuildOperationResult(
      env, PerformOnMainThread(pointer, &patch, operation));
}

napi_value Add(napi_env env, napi_callback_info info) {
  return Mutate(env, info, "add");
}

napi_value Update(napi_env env, napi_callback_info info) {
  return Mutate(env, info, "update");
}

napi_value Remove(napi_env env, napi_callback_info info) {
  return Mutate(env, info, "remove");
}

napi_value Init(napi_env env, napi_value exports) {
  napi_property_descriptor properties[] = {
      {"support", nullptr, Support, nullptr, nullptr, nullptr, napi_default,
       nullptr},
      {"add", nullptr, Add, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"update", nullptr, Update, nullptr, nullptr, nullptr, napi_default,
       nullptr},
      {"remove", nullptr, Remove, nullptr, nullptr, nullptr, napi_default,
       nullptr},
  };
  napi_define_properties(env, exports,
                         sizeof(properties) / sizeof(properties[0]), properties);
  return exports;
}

}  // namespace

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
