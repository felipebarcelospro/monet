import SwiftUI

/// The welcome screen, shown until a vault is opened.
struct OnboardingView: View {
  /// The shared application state.
  @Environment(AppModel.self) private var model

  var body: some View {
    ZStack {
      Palette.window
        .ignoresSafeArea()

      VStack(spacing: 0) {
        Spacer()

        VStack(spacing: 16) {
          Image(systemName: "circle.hexagongrid")
            .font(.system(size: 40, weight: .ultraLight))
            .foregroundStyle(Palette.textSecondary)

          VStack(spacing: 5) {
            Text("onboarding.title")
              .font(.system(size: 24, weight: .semibold))
              .foregroundStyle(Palette.text)

            Text("onboarding.subtitle")
              .font(Type.body)
              .foregroundStyle(Palette.textSecondary)
              .multilineTextAlignment(.center)
              .frame(maxWidth: 380)
              .lineSpacing(2)
          }

          Button {
            model.showsVaultPicker = true
          } label: {
            Text("onboarding.chooseVault")
              .font(.system(size: 12, weight: .medium))
              .padding(.horizontal, 14)
              .padding(.vertical, 6)
          }
          .buttonStyle(.borderedProminent)
          .controlSize(.regular)
          .keyboardShortcut("o", modifiers: [.command])
        }

        if !model.preferences.recentVaults.isEmpty {
          recentVaults
            .padding(.top, 36)
        }

        Spacer()

        Text("onboarding.hint")
          .font(Type.rowSubtitle)
          .foregroundStyle(Palette.textTertiary)
          .padding(.bottom, 24)
      }
      .padding(32)
    }
  }

  private var recentVaults: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text("onboarding.recent")
        .font(Type.section)
        .foregroundStyle(Palette.textTertiary)
        .padding(.leading, 4)

      VStack(spacing: 0) {
        ForEach(model.preferences.recentVaults.prefix(4), id: \.self) { url in
          Button {
            Task { await model.openVault(url) }
          } label: {
            HStack(spacing: 8) {
              Image(systemName: "folder")
                .font(.system(size: 11))
                .foregroundStyle(Palette.textTertiary)
                .frame(width: 15)
              Text(url.lastPathComponent)
                .font(Type.body)
                .foregroundStyle(Palette.text)
              Spacer(minLength: 0)
              Text(url.deletingLastPathComponent().path)
                .font(Type.rowSubtitle)
                .foregroundStyle(Palette.textTertiary)
                .lineLimit(1)
                .truncationMode(.head)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .contentShape(Rectangle())
          }
          .buttonStyle(.plain)
          .hoverHighlight()
        }
      }
      .frame(width: 360)
      .padding(3)
      .background(
        RoundedRectangle(cornerRadius: 9, style: .continuous)
          .fill(Palette.list)
      )
      .overlay(
        RoundedRectangle(cornerRadius: 9, style: .continuous)
          .strokeBorder(Palette.separator, lineWidth: Metrics.hairline)
      )
    }
  }
}
