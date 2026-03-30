describe("Presentator app", () => {
  it("launches and shows the main window", async () => {
    const title = await browser.getTitle();
    expect(title).toBeTruthy();
  });
});
