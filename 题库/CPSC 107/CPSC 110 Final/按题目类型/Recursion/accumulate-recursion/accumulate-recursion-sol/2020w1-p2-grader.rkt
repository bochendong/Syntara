#lang racket

(require spd-grader/grader)

(provide grader)

(define grader
  (lambda ()
    (grade-submission
   
      (define (%%all-sequences lon0)
        ;; curr is (listof Integer);reverse of sequence in lon0 ending just before lon
        ;; rsf is (listof Integer) ;sequences found so far
        ;; CONSTRAINT: curr will never be empty
        (local [(define (fn-for-lon lon curr rsf)
                  (cond [(empty? lon) (append rsf (list (reverse curr)))]
                        [else
                         (local [(define f (first lon))
                                 (define prev (first curr))]
                           (if (= (add1 prev) f)
                               (fn-for-lon (rest lon) (cons f curr) rsf)
                               (fn-for-lon (rest lon)
                                           (list f)
                                           (append rsf (list (reverse curr))))))]))]
          (if (empty? lon0)
              empty
              (fn-for-lon (rest lon0) (list (first lon0)) empty))))

      (define (%%longest-sequence lon0)
        ;; curr is (listof Integer);reverse of sequence in lon0 ending just before lon
        ;; rsf is (listof Integer) ;reverse of longest sequence found so far
        ;; CONSTRAINT: curr will never be empty
        (local [(define (fn-for-lon lon curr rsf)
                  (cond [(empty? lon) (reverse rsf)]
                        [else
                         (local [(define f (first lon))
                                 (define prev (first curr))
                                 (define ncurr (cons f curr))] ;might not get used
                           (if (= (add1 prev) f)
                               (fn-for-lon (rest lon) ncurr (longer-of ncurr rsf))
                               (fn-for-lon (rest lon)
                                           (list f)
                                           rsf)))]))
                (define (longer-of l1 l2)
                  (if (> (length l1) (length l2)) l1 l2))]
          
          (if (empty? lon0)
              empty
              (fn-for-lon (rest lon0) (list (first lon0)) (list (first lon0))))))
      
      (grade-problem 2
        (grade-htdf longest-sequence
	  (weights (.1 .1 *)
	    (grade-signature 1 ((listof Integer) -> (listof Integer)))

            (grade-tests-validity (lon) r
              (list? lon)
              (list? r)
              (equal? r (%%longest-sequence lon)))
              
            (grade-tests-argument-thoroughness (lon)
              (empty? lon)
              (> (length lon) 5)                                     ;room for 2/3 or 3/2
              (and (not (empty? lon))
                   (local [(define all (%%all-sequences lon))]       ;1st is longest
                     (>= (length (first all))
                         (foldr max 0 (map length (rest all))))))
              (and (not (empty? lon))
                   (local [(define all (%%all-sequences lon))]       ;1st is not longest
                     (< (length (first all))                     
                        (foldr max 0 (map length (rest all))))))
              (and (not (empty? lon))                                ;2 longest sequences with the same length
                   (local [(define all (%%all-sequences lon))
                           (define lens (map length all))
                           (define maxlen (foldr max 0 lens))]
                     (>= (length (filter (lambda (n) (= n maxlen)) lens)) 2))))
            
            (grade-template-origin 1 ((listof Integer) accumulator))
            
            (grade-additional-tests 1
	      (check-expect (longest-sequence (list)) (list))
	      (check-expect (longest-sequence (list 9)) (list 9))
	      (check-expect (longest-sequence (list 3 4)) (list 3 4))
	      (check-expect (longest-sequence (list 4 3)) (list 4))
	      (check-expect (longest-sequence (list 8 9 1 8 6 7)) (list 8 9))
	      (check-expect (longest-sequence (list 1 2 3 4 5 6 7)) (list 1 2 3 4 5 6 7))
	      (check-expect (longest-sequence (list 8 9 1 8 6 7 8)) (list 6 7 8))
	      (check-expect (longest-sequence (list 6 7 8 8 9 1 8)) (list 6 7 8))
	      (check-expect (longest-sequence (list 8 7 8 -3 -2 -1 5)) (list -3 -2 -1))
	      (check-expect (longest-sequence (list 7 5 3 -1)) (list 7)))))))))
