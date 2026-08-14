import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HistoryChart } from "./HistoryChart";

describe("HistoryChart", () => {
  it("explains when there is not enough persisted history", () => {
    render(<HistoryChart history={[]} />);
    expect(screen.getByText(/first 10-second observation bucket/i)).toBeInTheDocument();
  });

  it("renders an accessible distance chart", () => {
    render(
      <HistoryChart
        history={[
          { deviceId: "a", bucketStart: 1000, bucketSeconds: 10, minRssi: -62, maxRssi: -58, avgRssi: -60, avgDistance: 1, sampleCount: 5 },
          { deviceId: "a", bucketStart: 11000, bucketSeconds: 10, minRssi: -72, maxRssi: -68, avgRssi: -70, avgDistance: 3, sampleCount: 5 },
        ]}
      />,
    );
    expect(screen.getByRole("img", { name: /estimated distance history/i })).toBeInTheDocument();
  });
});
