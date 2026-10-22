import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { Inventory } from "./Inventory";
afterEach(cleanup);

it("groups the inventory into Talent / Props / SFX with the Wind machine under SFX", () => {
  const add = vi.fn();
  render(<Inventory onAdd={add} />);
  for (const name of ["Talent", "Props", "SFX"]) expect(screen.getByRole("group", { name })).toBeTruthy();
  fireEvent.click(within(screen.getByRole("group", { name: "SFX" })).getByRole("button", { name: /wind machine/i }));
  expect(add).toHaveBeenCalledWith("wind");
});
