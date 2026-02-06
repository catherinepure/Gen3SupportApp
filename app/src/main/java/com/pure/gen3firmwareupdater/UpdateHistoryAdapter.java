package com.pure.gen3firmwareupdater;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import java.util.List;

/**
 * Adapter for displaying telemetry/update history in a RecyclerView
 */
public class UpdateHistoryAdapter extends RecyclerView.Adapter<UpdateHistoryAdapter.ViewHolder> {

    public interface OnRecordClickListener {
        void onRecordClick(TelemetryRecord record);
    }

    private final List<TelemetryRecord> records;
    private OnRecordClickListener listener;

    public UpdateHistoryAdapter(List<TelemetryRecord> records) {
        this.records = records;
    }

    public void setOnRecordClickListener(OnRecordClickListener listener) {
        this.listener = listener;
    }

    @NonNull
    @Override
    public ViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View view = LayoutInflater.from(parent.getContext())
                .inflate(R.layout.item_update_history, parent, false);
        return new ViewHolder(view);
    }

    @Override
    public void onBindViewHolder(@NonNull ViewHolder holder, int position) {
        TelemetryRecord record = records.get(position);
        holder.tvDate.setText(record.getFormattedDate());

        // Show version info: "from -> to" for firmware updates, SW version for scans
        if (record.fromVersion != null && record.toVersion != null) {
            holder.tvVersionChange.setText(record.fromVersion + " → " + record.toVersion);
        } else if (record.swVersion != null) {
            holder.tvVersionChange.setText("SW: " + record.swVersion);
        } else {
            holder.tvVersionChange.setText("Version info unavailable");
        }

        // Show scan type or status
        String displayStatus = record.status != null ? record.status :
                               record.scanType != null ? record.getScanTypeDisplay() : "UNKNOWN";
        holder.tvStatus.setText(displayStatus.toUpperCase());

        if (record.errorMessage != null && !record.errorMessage.isEmpty()) {
            holder.tvError.setVisibility(View.VISIBLE);
            holder.tvError.setText("Error: " + record.errorMessage);
        } else {
            holder.tvError.setVisibility(View.GONE);
        }

        holder.itemView.setOnClickListener(v -> {
            if (listener != null) {
                listener.onRecordClick(record);
            }
        });
    }

    @Override
    public int getItemCount() {
        return records.size();
    }

    public static class ViewHolder extends RecyclerView.ViewHolder {
        TextView tvDate;
        TextView tvVersionChange;
        TextView tvStatus;
        TextView tvError;

        public ViewHolder(@NonNull View itemView) {
            super(itemView);
            tvDate = itemView.findViewById(R.id.tvDate);
            tvVersionChange = itemView.findViewById(R.id.tvVersionChange);
            tvStatus = itemView.findViewById(R.id.tvStatus);
            tvError = itemView.findViewById(R.id.tvError);
        }
    }
}
