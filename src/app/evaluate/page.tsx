import { redirect } from 'next/navigation';

export default function EvaluatePage() {
  redirect('/workspace?tab=companies');
}
