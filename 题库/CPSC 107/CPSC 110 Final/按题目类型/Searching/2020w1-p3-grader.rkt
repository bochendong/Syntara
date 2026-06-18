#lang racket

(require spd-grader/grader)

(provide grader)

(define grader
  (lambda ()
    (grade-submission
      (grade-problem 1
        ;; Malformed display message and give 0; TA grade w/ penalty
        (cond [(not (and (check-evaluatable? 'visited-values)
			 ((evaluator) '(and (is-list-of-four-elements visited-values)
                                            (is-list-of-list-of-string visited-values)
                                            (is-list-of-list-of-tree-name visited-values)))))
	       (score 1 0 '("visited-values not defined or malformed"))]	      
	      [(not (and (check-evaluatable? 'tree-wl-values)
			 ((evaluator) '(and (is-list-of-four-elements tree-wl-values)
                                            (is-list-of-list-of-tree tree-wl-values)))))
	       (score 1 0 '("tree-wl-values not defined or malformed"))]	      
	      [(not (and (check-evaluatable? 'path-wl-values)
			 ((evaluator) '(and (is-list-of-four-elements path-wl-values)
                                            (is-list-of-list-of-list-of-string path-wl-values)
                                            (is-list-of-list-of-list-of-tree-name path-wl-values)))))
	       (score 1 0 '("path-wl-values not defined or malformed"))]
	      [else
	       (weights (*)
                 (check 'visited-values
                        '(list empty     
                               (list "R" "S")                     ;3
                               (list "R" "S" "V" "W")             ;5
                               (list "R" "S" "V" "W" "T" "X")))   ;7
                 (check 'tree-wl-values
                        '(list empty       
                               (list W T U)
                               (list U)
                               (list))
                        '(empty       
                          (W T U)
                          (U)
                          ()))
                 (check 'path-wl-values
                        '(list empty       
                               (list (list "R" "S") (list "R") (list "R"))  
                               (list (list "R"))  
                               (list))))])))))


(define (check var sol [display ((evaluator) sol)])
  (let ([sub ((evaluator) var)]
        [sol ((evaluator) sol)])
    (header (format "In ~a: " var)
            (combine-scores
             (weights* 1.0 '(*)
                       (if (not (= (length sub) (length sol)))
                           (list (rubric-item 'other #f "~a has wrong length" var))
                           (map (lambda (su so d)
                                  (rubric-item 'signature (equal? su so) "~s" d))
                                sub
                                sol
                                display)))))))
					  
  
