"""
Time-series forecasting module for the SMM Analytics Platform.

Uses Holt-Winters Exponential Smoothing when >=8 weeks of data are available,
falling back to simple Linear Regression for shorter series.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression

try:
    from statsmodels.tsa.holtwinters import ExponentialSmoothing
    STATSMODELS_AVAILABLE = True
except ImportError:
    STATSMODELS_AVAILABLE = False


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _safe_float(val: Any, default: float = 0.0) -> float:
    try:
        f = float(val)
        return default if (np.isnan(f) or np.isinf(f)) else f
    except Exception:
        return default


def _future_dates(last_date_str: str, periods: int) -> list[str]:
    """Generate *periods* daily ISO date strings starting the day after last_date_str."""
    try:
        last = datetime.strptime(last_date_str, "%Y-%m-%d")
    except Exception:
        last = datetime.utcnow()
    return [(last + timedelta(days=i + 1)).strftime("%Y-%m-%d") for i in range(periods)]


def _trend_label(slope: float) -> str:
    if slope > 0.005:
        return "up"
    if slope < -0.005:
        return "down"
    return "flat"


# ---------------------------------------------------------------------------
# Core forecast function
# ---------------------------------------------------------------------------

def forecast_metric(weekly_data: list[dict], metric: str, periods: int = 30) -> dict:
    """
    Forecast *metric* for the next *periods* days.

    Parameters
    ----------
    weekly_data : list[dict]
        Each dict must have at least ``{'week': 'YYYY-MM-DD', metric: value}``.
    metric : str
        Column to forecast (e.g. 'avg_er', 'total_reach').
    periods : int
        Number of daily forecast points (default 30).

    Returns
    -------
    dict with keys:
        dates, forecast, lower, upper, method, trend, projected_30d
    """
    if not weekly_data:
        return _empty_forecast(periods)

    # Extract values; fill missing with forward-fill then zero
    values = []
    last_week = weekly_data[-1].get("week", "")
    for entry in weekly_data:
        raw = entry.get(metric, 0)
        values.append(_safe_float(raw))

    values = np.array(values, dtype=float)

    # Remove leading / trailing NaN
    mask = ~np.isnan(values)
    if mask.sum() < 2:
        return _empty_forecast(periods, last_week)

    values = values[mask]

    # Decide on method
    use_hw = STATSMODELS_AVAILABLE and len(values) >= 8

    if use_hw:
        forecast_vals, lower, upper, slope = _holt_winters(values, periods)
        method = "holt_winters"
    else:
        forecast_vals, lower, upper, slope = _linear_regression(values, periods)
        method = "linear_regression"

    dates = _future_dates(last_week, periods)

    # Clip to non-negative for metrics that cannot go below 0
    forecast_vals = np.maximum(forecast_vals, 0)
    lower = np.maximum(lower, 0)
    upper = np.maximum(upper, 0)

    return {
        "dates": dates,
        "forecast": [round(float(v), 4) for v in forecast_vals],
        "lower": [round(float(v), 4) for v in lower],
        "upper": [round(float(v), 4) for v in upper],
        "method": method,
        "trend": _trend_label(slope),
        "projected_30d": round(float(forecast_vals[-1]), 4) if len(forecast_vals) else 0.0,
    }


def _empty_forecast(periods: int = 30, last_week: str = "") -> dict:
    today = last_week or datetime.utcnow().strftime("%Y-%m-%d")
    dates = _future_dates(today, periods)
    zeros = [0.0] * periods
    return {
        "dates": dates,
        "forecast": zeros,
        "lower": zeros,
        "upper": zeros,
        "method": "insufficient_data",
        "trend": "flat",
        "projected_30d": 0.0,
    }


def _holt_winters(values: np.ndarray, periods: int):
    """
    Fit Holt-Winters ExponentialSmoothing and forecast *periods* steps ahead.
    Returns (forecast_vals, lower, upper, slope).
    """
    try:
        model = ExponentialSmoothing(
            values,
            trend="add",
            seasonal=None,  # not enough data for seasonality in most cases
            initialization_method="estimated",
        )
        fit = model.fit(optimized=True, disp=False)

        # Forecast weekly, then interpolate to daily
        weekly_periods = max(1, int(np.ceil(periods / 7)))
        weekly_forecast = fit.forecast(weekly_periods)

        # Interpolate to daily
        x_weekly = np.linspace(0, periods - 1, len(weekly_forecast))
        x_daily = np.arange(periods)
        forecast_vals = np.interp(x_daily, x_weekly, weekly_forecast)

        # Confidence interval: ±1.96 * residual std
        residuals = values - fit.fittedvalues
        res_std = float(np.std(residuals))
        margin = 1.96 * res_std
        lower = forecast_vals - margin
        upper = forecast_vals + margin

        # Slope from first to last forecast
        slope = (forecast_vals[-1] - forecast_vals[0]) / max(len(forecast_vals), 1)
        return forecast_vals, lower, upper, slope

    except Exception:
        # Fall back to linear regression on failure
        return _linear_regression(values, periods)


def _linear_regression(values: np.ndarray, periods: int):
    """
    Fit a simple OLS linear trend and forecast *periods* steps ahead.
    Returns (forecast_vals, lower, upper, slope).
    """
    n = len(values)
    x = np.arange(n).reshape(-1, 1)

    lr = LinearRegression()
    lr.fit(x, values)

    x_future = np.arange(n, n + periods).reshape(-1, 1)
    forecast_vals = lr.predict(x_future)

    # Residual standard deviation for confidence band
    fitted = lr.predict(x)
    residuals = values - fitted
    res_std = float(np.std(residuals))
    margin = 1.96 * res_std

    lower = forecast_vals - margin
    upper = forecast_vals + margin

    slope = float(lr.coef_[0])
    return forecast_vals, lower, upper, slope


# ---------------------------------------------------------------------------
# High-level API
# ---------------------------------------------------------------------------

def forecast_all(analytics_result: dict) -> dict:
    """
    Run forecasts on reach and engagement_rate from the weekly_trend list.

    Parameters
    ----------
    analytics_result : dict
        Full analytics dict from kpi_engine.compute_full_analytics()

    Returns
    -------
    dict
        {'reach': {...}, 'engagement_rate': {...}}
    """
    weekly_trend = analytics_result.get("weekly_trend", [])

    reach_forecast = forecast_metric(weekly_trend, "total_reach", periods=30)
    er_forecast = forecast_metric(weekly_trend, "avg_er", periods=30)

    return {
        "reach": reach_forecast,
        "engagement_rate": er_forecast,
    }
