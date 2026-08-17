import { Link, type LinkProps } from 'react-router-dom';

interface LinkedCellProps extends Omit<LinkProps, 'to'> {
  /** DataGrid row params (used to infer `to` if not provided) */
  params?: { row: { id: string | number } };
  to?: string;
}

/**
 * A full-cell link wrapper for use inside DataGrid rows
 */
export const LinkedCell = ({ params, className, to, children, ...props }: LinkedCellProps) => {
  return (
    <Link className={className} to={to ?? params?.row.id.toString() ?? ''} {...props}>
      {children}
    </Link>
  );
};
