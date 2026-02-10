package com.pure.gen3firmwareupdater.views;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.util.AttributeSet;
import android.view.View;

import com.pure.gen3firmwareupdater.R;

/**
 * Custom circular gauge view for displaying battery state of charge.
 * Color changes based on level: green >50%, yellow 20-50%, red <20%.
 */
public class BatteryGaugeView extends View {

    private static final float START_ANGLE = 135f;
    private static final float SWEEP_ANGLE = 270f;

    private Paint bgArcPaint;
    private Paint fgArcPaint;
    private Paint valuePaint;
    private Paint unitPaint;
    private Paint labelPaint;
    private RectF arcRect;

    private int batteryPercent = 0;

    public BatteryGaugeView(Context context) {
        super(context);
        init();
    }

    public BatteryGaugeView(Context context, AttributeSet attrs) {
        super(context, attrs);
        init();
    }

    public BatteryGaugeView(Context context, AttributeSet attrs, int defStyleAttr) {
        super(context, attrs, defStyleAttr);
        init();
    }

    private void init() {
        bgArcPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        bgArcPaint.setStyle(Paint.Style.STROKE);
        bgArcPaint.setStrokeWidth(12f);
        bgArcPaint.setStrokeCap(Paint.Cap.ROUND);
        bgArcPaint.setColor(getContext().getColor(R.color.gauge_bg));

        fgArcPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        fgArcPaint.setStyle(Paint.Style.STROKE);
        fgArcPaint.setStrokeWidth(12f);
        fgArcPaint.setStrokeCap(Paint.Cap.ROUND);

        valuePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        valuePaint.setColor(getContext().getColor(R.color.dashboard_text_primary));
        valuePaint.setTextAlign(Paint.Align.CENTER);
        valuePaint.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));

        unitPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        unitPaint.setColor(getContext().getColor(R.color.dashboard_text_secondary));
        unitPaint.setTextAlign(Paint.Align.CENTER);

        labelPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        labelPaint.setColor(0xFF6B7280);
        labelPaint.setTextAlign(Paint.Align.CENTER);
        labelPaint.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
        labelPaint.setLetterSpacing(0.1f);

        arcRect = new RectF();
    }

    public void setBatteryPercent(int percent) {
        this.batteryPercent = Math.max(0, Math.min(100, percent));
        invalidate();
    }

    private int getBatteryColor() {
        if (batteryPercent > 50) {
            return getContext().getColor(R.color.gauge_battery_green);
        } else if (batteryPercent > 20) {
            return getContext().getColor(R.color.gauge_battery_yellow);
        } else {
            return getContext().getColor(R.color.gauge_battery_red);
        }
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);

        float width = getWidth();
        float height = getHeight();
        float size = Math.min(width, height);
        float padding = bgArcPaint.getStrokeWidth() + 8f;

        float cx = width / 2f;
        float cy = height / 2f;

        arcRect.set(cx - size / 2f + padding, cy - size / 2f + padding,
                cx + size / 2f - padding, cy + size / 2f - padding);

        // Background arc
        canvas.drawArc(arcRect, START_ANGLE, SWEEP_ANGLE, false, bgArcPaint);

        // Foreground arc (battery progress)
        fgArcPaint.setColor(getBatteryColor());
        float percentage = batteryPercent / 100f;
        float sweepDeg = SWEEP_ANGLE * percentage;
        canvas.drawArc(arcRect, START_ANGLE, sweepDeg, false, fgArcPaint);

        // Battery value text
        valuePaint.setTextSize(size * 0.28f);
        canvas.drawText(String.valueOf(batteryPercent), cx, cy + size * 0.04f, valuePaint);

        // "%" unit text
        unitPaint.setTextSize(size * 0.12f);
        canvas.drawText("%", cx, cy + size * 0.16f, unitPaint);

        // "BATTERY" label
        labelPaint.setTextSize(size * 0.08f);
        canvas.drawText("BATTERY", cx, cy + size * 0.28f, labelPaint);
    }

    @Override
    protected void onMeasure(int widthMeasureSpec, int heightMeasureSpec) {
        int desiredSize = dpToPx(140);
        int width = resolveSize(desiredSize, widthMeasureSpec);
        int height = resolveSize(desiredSize, heightMeasureSpec);
        int size = Math.min(width, height);
        setMeasuredDimension(size, size);
    }

    private int dpToPx(int dp) {
        return (int) (dp * getContext().getResources().getDisplayMetrics().density);
    }
}
